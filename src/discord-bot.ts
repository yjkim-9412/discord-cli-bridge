import {
  ApplicationCommandOptionType,
  Client,
  GatewayIntentBits,
  Partials,
  type ApplicationCommandDataResolvable,
  type ChatInputCommandInteraction,
  type Interaction,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { parseCommandText, parseModelArgs, parseRunArgs, type ParsedCommand } from "./command-parser.js";
import { isPathWithinRoot, loadConfig, resolveDefaultProviderModel } from "./config.js";
import { buildSessionKey, normalizeGuildId, resolveBinding } from "./router.js";
import { listModelsForProvider, providerSupportsReasoning, runCli } from "./runner/cli-runner.js";
import { ApprovalStore } from "./storage/approval-store.js";
import { SessionStore } from "./storage/session-store.js";
import type { ProviderId, ReasoningEffort, ResolvedConfig, SessionState } from "./types.js";
import { chunkText } from "./utils/chunk.js";

const DEFAULT_REASONING_EFFORT: ReasoningEffort = "xhigh";
const REASONING_LEVELS: ReasoningEffort[] = ["low", "medium", "high", "xhigh"];


const HELP_TEXT = [
  "Commands (slash, prefix, or mention):",
  "- /help or !help",
  "- /status or !status",
  "- /run <prompt> [provider] or !run [--provider codex|claude] <prompt>",
  "- /approve <approvalId> or !approve <approvalId> (owner)",
  "- /deny <approvalId> or !deny <approvalId> (owner)",
  "- /provider <codex|claude> or !provider <codex|claude> (owner)",
  "- /model <model> [--reasoning low|medium|high|xhigh] (owner)",
  "- /models or !models",
  "- /new or !new (owner)",
  "- @bot <text> (treated as run prompt)",
].join("\n");

const SLASH_COMMANDS: ApplicationCommandDataResolvable[] = [
  {
    name: "help",
    description: "Show bridge commands",
  },
  {
    name: "status",
    description: "Show channel session status",
  },
  {
    name: "models",
    description: "Show available models and reasoning levels",
  },
  {
    name: "run",
    description: "Request a CLI run (approval required)",
    options: [
      {
        name: "prompt",
        description: "Prompt to run",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: "provider",
        description: "Optional provider override",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "codex", value: "codex" },
          { name: "claude", value: "claude" },
        ],
      },
    ],
  },
  {
    name: "approve",
    description: "Approve a pending request",
    options: [
      {
        name: "approval_id",
        description: "Approval ID from /run",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: "deny",
    description: "Deny a pending request",
    options: [
      {
        name: "approval_id",
        description: "Approval ID from /run",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: "provider",
    description: "Set default provider for this channel session",
    options: [
      {
        name: "provider",
        description: "Provider",
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: "codex", value: "codex" },
          { name: "claude", value: "claude" },
        ],
      },
    ],
  },
  {
    name: "model",
    description: "Set default model for this channel session",
    options: [
      {
        name: "model",
        description: "Model name",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: "reasoning",
        description: "Optional reasoning level",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "low", value: "low" },
          { name: "medium", value: "medium" },
          { name: "high", value: "high" },
          { name: "extra high", value: "xhigh" },
        ],
      },
    ],
  },
  {
    name: "new",
    description: "Reset stored CLI session IDs",
  },
];

type SendableChannel = {
  send: (content: string) => Promise<unknown>;
  sendTyping: () => Promise<unknown>;
};

type CommandContext = {
  userId: string;
  guildId: string | null;
  channelId: string;
  channel: TextBasedChannel | null;
  reply: (content: string) => Promise<void>;
};

function asSendableChannel(channel: TextBasedChannel): SendableChannel | null {
  const candidate = channel as Partial<SendableChannel>;
  if (typeof candidate.send === "function" && typeof candidate.sendTyping === "function") {
    return candidate as SendableChannel;
  }
  return null;
}

function mentionUser(userId: string, content: string): string {
  return `<@${userId}> ${content}`;
}

function stripLeadingBotMention(content: string, botUserId: string): string | null {
  const trimmed = content.trim();
  const mentionA = `<@${botUserId}>`;
  const mentionB = `<@!${botUserId}>`;

  if (trimmed.startsWith(mentionA)) {
    return trimmed.slice(mentionA.length).trim();
  }
  if (trimmed.startsWith(mentionB)) {
    return trimmed.slice(mentionB.length).trim();
  }
  return null;
}

function parseMessageCommand(content: string, botUserId?: string): ParsedCommand | null {
  const parsed = parseCommandText(content);
  if (parsed) {
    return parsed;
  }

  if (!botUserId) {
    return null;
  }

  const remainder = stripLeadingBotMention(content, botUserId);
  if (remainder === null) {
    return null;
  }
  if (!remainder) {
    return { name: "help", args: "" };
  }

  const mentionCommand = parseCommandText(remainder);
  if (mentionCommand) {
    return mentionCommand;
  }

  return {
    name: "run",
    args: remainder,
  };
}

function normalizeShortcutKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseShortcutTarget(raw: string): ParsedCommand | null {
  const target = raw.trim();
  if (!target) {
    return null;
  }
  return parseCommandText(`/${target}`);
}

function applyDirectShortcut(params: {
  shortcuts: Map<string, string>;
  name: string;
  args: string;
}): ParsedCommand | null {
  const trimmedArgs = params.args.trim();
  const fullKey = normalizeShortcutKey(trimmedArgs ? `${params.name} ${trimmedArgs}` : params.name);
  const simpleKey = normalizeShortcutKey(params.name);

  if (trimmedArgs && params.shortcuts.has(fullKey)) {
    const target = parseShortcutTarget(params.shortcuts.get(fullKey) ?? "");
    if (!target) {
      return null;
    }
    return target;
  }

  if (params.shortcuts.has(simpleKey)) {
    const target = parseShortcutTarget(params.shortcuts.get(simpleKey) ?? "");
    if (!target) {
      return null;
    }
    const combinedArgs = [target.args, trimmedArgs].filter(Boolean).join(" ").trim();
    return {
      name: target.name,
      args: combinedArgs,
    };
  }

  return null;
}

function applyRunPromptShortcut(params: {
  shortcuts: Map<string, string>;
  prompt: string;
}): ParsedCommand | null {
  const trimmedPrompt = params.prompt.trim();
  if (!trimmedPrompt) {
    return null;
  }

  const normalizedPrompt = normalizeShortcutKey(trimmedPrompt);

  const builtInPromptAliases = new Map([
    ["status", "status"],
    ["codex status", "status"],
    ["상태", "status"],
    ["models", "models"],
    ["model list", "models"],
    ["모델", "models"],
    ["reasoning", "models"],
    ["추론", "models"],
  ]);
  const builtInCommand = builtInPromptAliases.get(normalizedPrompt);
  if (builtInCommand) {
    return { name: builtInCommand, args: "" };
  }

  if (params.shortcuts.has(normalizedPrompt)) {
    const target = parseShortcutTarget(params.shortcuts.get(normalizedPrompt) ?? "");
    if (!target) {
      return null;
    }
    return target;
  }

  const parts = trimmedPrompt.split(/\s+/);
  const trigger = normalizeShortcutKey(parts[0] ?? "");
  if (!trigger) {
    return null;
  }

  if (!params.shortcuts.has(trigger)) {
    return null;
  }

  const target = parseShortcutTarget(params.shortcuts.get(trigger) ?? "");
  if (!target) {
    return null;
  }

  const forwardedArgs = parts.slice(1).join(" ").trim();
  const combinedArgs = [target.args, forwardedArgs].filter(Boolean).join(" ").trim();
  return {
    name: target.name,
    args: combinedArgs,
  };
}

function isOwner(config: ResolvedConfig, userId: string): boolean {
  return userId === config.ownerDiscordUserId;
}

async function requireOwner(
  config: ResolvedConfig,
  userId: string,
  reply: (content: string) => Promise<void>,
): Promise<boolean> {
  if (isOwner(config, userId)) {
    return true;
  }
  await reply("Only the configured owner can run this command.");
  return false;
}

async function sendLong(channel: TextBasedChannel, text: string, mentionUserId?: string): Promise<void> {
  const sendable = asSendableChannel(channel);
  if (!sendable) {
    return;
  }

  let isFirstChunk = true;
  for (const chunk of chunkText(text, 1900)) {
    const content = isFirstChunk && mentionUserId ? mentionUser(mentionUserId, chunk) : chunk;
    await sendable.send(content);
    isFirstChunk = false;
  }
}

async function sendLongViaReply(
  reply: (content: string) => Promise<void>,
  text: string,
): Promise<void> {
  for (const chunk of chunkText(text, 1900)) {
    await reply(chunk);
  }
}

function toParsedCommand(interaction: ChatInputCommandInteraction): ParsedCommand {
  const name = interaction.commandName.toLowerCase();
  switch (name) {
    case "run": {
      const prompt = interaction.options.getString("prompt", true).trim();
      const provider = interaction.options.getString("provider")?.trim().toLowerCase();
      if (!provider) {
        return { name, args: prompt };
      }
      return {
        name,
        args: `--provider ${provider} ${prompt}`,
      };
    }
    case "approve":
    case "deny": {
      const approvalId = interaction.options.getString("approval_id", true).trim();
      return { name, args: approvalId };
    }
    case "provider": {
      const provider = interaction.options.getString("provider", true).trim().toLowerCase();
      return { name, args: provider };
    }
    case "model": {
      const model = interaction.options.getString("model", true).trim();
      const reasoning = interaction.options.getString("reasoning")?.trim().toLowerCase();
      if (!reasoning) {
        return { name, args: model };
      }
      return { name, args: `${model} --reasoning ${reasoning}` };
    }
    default:
      return { name, args: "" };
  }
}

export class DiscordCliBridge {
  private readonly config: ResolvedConfig;
  private readonly sessionStore: SessionStore;
  private readonly approvalStore: ApprovalStore;
  private readonly client: Client;
  private readonly expireTimer: NodeJS.Timeout;

  constructor(configPath?: string) {
    this.config = loadConfig(configPath);
    this.sessionStore = new SessionStore(this.config.stateDir);
    this.approvalStore = new ApprovalStore(this.config.stateDir);
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    this.client.on("ready", () => {
      console.log(`Bridge online as ${this.client.user?.tag ?? "(unknown)"}`);
      void this.registerSlashCommands();
    });

    this.client.on("messageCreate", (message) => {
      void this.onMessage(message);
    });

    this.client.on("interactionCreate", (interaction) => {
      void this.onInteraction(interaction);
    });

    this.expireTimer = setInterval(() => {
      void this.approvalStore.expirePending();
    }, 60_000);
  }

  async start(): Promise<void> {
    await this.client.login(this.config.botToken);
  }

  async stop(): Promise<void> {
    clearInterval(this.expireTimer);
    await this.client.destroy();
  }

  private async registerSlashCommands(): Promise<void> {
    const application = this.client.application;
    if (!application) {
      console.warn("Slash command registration skipped: Discord application is unavailable.");
      return;
    }

    const guildIds = new Set<string>();
    for (const binding of this.config.bindingsByKey.values()) {
      if (binding.guildId && binding.guildId !== "dm") {
        guildIds.add(binding.guildId);
      }
    }

    for (const guildId of guildIds) {
      try {
        await application.commands.set(SLASH_COMMANDS, guildId);
        console.log(`Registered ${SLASH_COMMANDS.length} slash commands for guild ${guildId}.`);
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        console.error(
          `Failed to register slash commands for guild ${guildId}: ${text}. Use !help message commands instead.`,
        );
      }
    }
  }

  private async resolveSession(guildIdRaw: string | null, channelId: string): Promise<SessionState | null> {
    const guildId = normalizeGuildId(guildIdRaw);
    const binding = resolveBinding({
      config: this.config,
      guildId,
      channelId,
    });

    if (!binding) {
      return null;
    }

    const defaults = resolveDefaultProviderModel({
      config: this.config,
      projectAlias: binding.project,
    });

    const sessionKey = buildSessionKey(guildId, channelId);
    const session = await this.sessionStore.getOrCreate({
      sessionKey,
      guildId,
      channelId,
      projectAlias: binding.project,
      workspacePath: defaults.workspacePath,
      provider: defaults.provider,
      model: defaults.model,
      reasoningEffort: DEFAULT_REASONING_EFFORT,
    });
    if (this.config.workspaceRoot && !isPathWithinRoot(session.workspacePath, this.config.workspaceRoot)) {
      session.workspacePath = defaults.workspacePath;
      session.projectAlias = binding.project;
      await this.sessionStore.update(session);
    }
    return session;
  }

  private isWorkspaceAllowed(workspacePath: string): boolean {
    if (!this.config.workspaceRoot) {
      return true;
    }
    return isPathWithinRoot(workspacePath, this.config.workspaceRoot);
  }

  private resolveShortcuts(parsed: ParsedCommand): ParsedCommand {
    if (parsed.name === "run") {
      const mappedRun = applyRunPromptShortcut({
        shortcuts: this.config.shortcuts,
        prompt: parsed.args,
      });
      if (mappedRun) {
        return mappedRun;
      }
      return parsed;
    }

    const mappedDirect = applyDirectShortcut({
      shortcuts: this.config.shortcuts,
      name: parsed.name,
      args: parsed.args,
    });
    return mappedDirect ?? parsed;
  }

  private async onMessage(message: Message): Promise<void> {
    if (message.author.bot) {
      return;
    }

    const rawParsed = parseMessageCommand(message.content, this.client.user?.id);
    if (!rawParsed) {
      return;
    }
    const parsed = this.resolveShortcuts(rawParsed);

    const channel = message.channel;

    await this.handleCommand(
      {
        userId: message.author.id,
        guildId: message.guildId,
        channelId: message.channelId,
        channel,
        reply: async (content: string) => {
          const sendable = asSendableChannel(channel);
          const text = mentionUser(message.author.id, content);
          if (sendable) {
            await sendable.send(text);
            return;
          }
          await message.reply(text);
        },
      },
      parsed,
    );
  }

  private async onInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    try {
      // Acknowledge the interaction immediately to avoid Unknown interaction (10062).
      await interaction.deferReply();

      const parsed = toParsedCommand(interaction);

      await this.handleCommand(
        {
          userId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          channel: interaction.channel as TextBasedChannel | null,
          reply: async (content: string) => {
            const text = mentionUser(interaction.user.id, content);
            if (interaction.deferred || interaction.replied) {
              await interaction.editReply({ content: text });
              return;
            }
            await interaction.reply({ content: text });
          },
        },
        parsed,
      );
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      console.error(`Interaction handling failed: ${errorText}`);

      try {
        const text = mentionUser(interaction.user.id, `Command failed: ${errorText}`);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: text });
          return;
        }
        await interaction.reply({ content: text });
      } catch {
        // Ignore secondary response failures; the primary error was already logged.
      }
    }
  }

  private async executeRun(params: {
    context: CommandContext;
    sessionKey: string;
    provider: ProviderId;
    model: string;
    prompt: string;
    workspacePath: string;
    reasoningEffort: ReasoningEffort;
    startText: string;
    completeTitle: string;
    failTitle: string;
  }): Promise<void> {
    await params.context.reply(params.startText);

    try {
      const sendable = params.context.channel ? asSendableChannel(params.context.channel) : null;
      if (sendable) {
        await sendable.sendTyping();
      }

      const result = await runCli({
        provider: params.provider,
        model: params.model,
        prompt: params.prompt,
        workspacePath: params.workspacePath,
        timeoutMs: this.config.defaults.runTimeoutMs,
        reasoningEffort: params.reasoningEffort,
        resumeSessionId: (await this.sessionStore.get(params.sessionKey))?.cliSessionIds?.[params.provider],
      });

      await this.sessionStore.setRunResult({
        sessionKey: params.sessionKey,
        provider: params.provider,
        sessionId: result.sessionId,
        lastRunAt: Date.now(),
      });

      const reasoningText = providerSupportsReasoning(params.provider)
        ? params.reasoningEffort
        : params.reasoningEffort + " (ignored by " + params.provider + ")";

      const header = [
        params.completeTitle,
        "Engine: " + params.provider + "/" + params.model,
        "Reasoning: " + reasoningText,
        "Duration: " + result.durationMs + "ms",
      ].join("\n");

      const contextFooter =
        result.contextLeftPercent != null
          ? `${result.contextLeftPercent}% context left`
          : "context left: n/a";

      const fullText = `${header}\n\n${result.text}\n\n${contextFooter}`;
      if (params.context.channel) {
        await sendLong(params.context.channel, fullText, params.context.userId);
      } else {
        await sendLongViaReply(params.context.reply, fullText);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const failText = `${params.failTitle}: ${text}`;
      if (params.context.channel) {
        await sendLong(params.context.channel, failText, params.context.userId);
      } else {
        await sendLongViaReply(params.context.reply, failText);
      }
    }
  }

  private async handleCommand(context: CommandContext, parsed: ParsedCommand): Promise<void> {
    await this.approvalStore.expirePending();

    const session = await this.resolveSession(context.guildId, context.channelId);
    if (!session) {
      await context.reply("This channel is not bound to a project. Add a binding in config/projects.yml.");
      return;
    }

    switch (parsed.name) {
      case "help": {
        await context.reply(HELP_TEXT);
        return;
      }
      case "status": {
        const pending = await this.approvalStore.pendingCountForSession(session.sessionKey);
        const status = [
          `Session: ${session.sessionKey}`,
          `Project: ${session.projectAlias}`,
          `Workspace: ${session.workspacePath}`,
          `Workspace root: ${this.config.workspaceRoot ?? "(not set)"}`,
          `Provider(default): ${session.provider}`,
          `Model(default): ${session.model}`,
          `Reasoning(default): ${session.reasoningEffort ?? DEFAULT_REASONING_EFFORT}`,
          "Current provider session: " + (session.cliSessionIds?.[session.provider] ?? "(none)"),
          "Codex session: " + (session.cliSessionIds?.codex ?? "(none)"),
          "Claude session: " + (session.cliSessionIds?.claude ?? "(none)"),
          `Pending approvals: ${pending}`,
          `Last run: ${session.lastRunAt ? new Date(session.lastRunAt).toISOString() : "never"}`,
        ].join("\n");
        await context.reply(status);
        return;
      }
      case "models": {
        const currentReasoning = session.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
        const codexModels = listModelsForProvider({
          provider: "codex",
          configuredModels: this.config.defaults.models.codex,
        });
        const claudeModels = listModelsForProvider({
          provider: "claude",
          configuredModels: this.config.defaults.models.claude,
        });
        const summary = [
          "Current(default): " + session.provider + "/" + session.model + " (reasoning: " + currentReasoning + ")",
          "Provider model list:",
          "- codex: " + codexModels.join(", "),
          "- claude: " + claudeModels.join(", "),
          "Reasoning levels (codex): " + REASONING_LEVELS.join(", "),
          providerSupportsReasoning("claude")
            ? "Claude reasoning: supported"
            : "Claude reasoning: stored in session but ignored on run",
          "Set with: /model <model> [--reasoning low|medium|high|xhigh]",
        ].join("\n");
        await context.reply(summary);
        return;
      }
      case "provider": {
        if (!(await requireOwner(this.config, context.userId, context.reply))) {
          return;
        }
        const next = parsed.args.trim().toLowerCase();
        if (next !== "codex" && next !== "claude") {
          await context.reply("Usage: /provider <codex|claude>");
          return;
        }
        const updated = await this.sessionStore.setProvider(session.sessionKey, next);
        await context.reply(`Session provider set to ${updated.provider}.`);
        return;
      }
      case "model": {
        if (!(await requireOwner(this.config, context.userId, context.reply))) {
          return;
        }
        const parsedModel = parseModelArgs(parsed.args);
        if (parsedModel.error) {
          await context.reply(
            `Usage: /model <model> [--reasoning low|medium|high|xhigh]\n${parsedModel.error}`,
          );
          return;
        }
        let updated = await this.sessionStore.setModel(session.sessionKey, parsedModel.model);
        if (parsedModel.reasoningEffort) {
          updated = await this.sessionStore.setReasoningEffort(
            session.sessionKey,
            parsedModel.reasoningEffort,
          );
        }
        await context.reply(
          `Session model set to ${updated.model} (reasoning: ${updated.reasoningEffort ?? DEFAULT_REASONING_EFFORT}).`,
        );
        return;
      }
      case "new": {
        if (!(await requireOwner(this.config, context.userId, context.reply))) {
          return;
        }
        await this.sessionStore.resetProviderSession(session.sessionKey, session.provider);
        await context.reply(
          "Session reset for " + session.provider + ": next " + session.provider + " run will start a new session.",
        );
        return;
      }
      case "run": {
        const runArgs = parseRunArgs(parsed.args);
        if (runArgs.error) {
          await context.reply(`Usage: /run [--provider codex|claude] <prompt>\n${runArgs.error}`);
          return;
        }
        if (!this.isWorkspaceAllowed(session.workspacePath)) {
          await context.reply(
            `Blocked: workspace is outside BRIDGE_WORKSPACE_ROOT (${this.config.workspaceRoot}).`,
          );
          return;
        }

        const provider = runArgs.providerOverride ?? session.provider;
        const reasoningEffort = session.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
        if (isOwner(this.config, context.userId)) {
          await this.executeRun({
            context,
            sessionKey: session.sessionKey,
            provider,
            model: session.model,
            reasoningEffort,
            prompt: runArgs.prompt,
            workspacePath: session.workspacePath,
            startText: `Running ${provider}/${session.model} (${reasoningEffort})...`,
            completeTitle: "Run completed",
            failTitle: "Run failed",
          });
          return;
        }

        const request = await this.approvalStore.create({
          sessionKey: session.sessionKey,
          requestedBy: context.userId,
          provider,
          model: session.model,
          reasoningEffort,
          workspacePath: session.workspacePath,
          prompt: runArgs.prompt,
          ttlMs: this.config.defaults.approvalTtlSec * 1000,
        });

        await context.reply(
          [
            `Approval required: #${request.approvalId}`,
            `Provider: ${request.provider}`,
            `Model: ${request.model}`,
            `Reasoning: ${request.reasoningEffort ?? DEFAULT_REASONING_EFFORT}`,
            `Workspace: ${request.workspacePath}`,
            `Requester: <@${context.userId}>`,
            `Expires: ${new Date(request.expiresAt).toISOString()}`,
            `Approve with: /approve ${request.approvalId}`,
            `Deny with: /deny ${request.approvalId}`,
          ].join("\n"),
        );
        return;
      }
      case "approve": {
        if (!(await requireOwner(this.config, context.userId, context.reply))) {
          return;
        }

        const approvalId = parsed.args.trim();
        if (!approvalId) {
          await context.reply("Usage: /approve <approvalId>");
          return;
        }

        const approval = await this.approvalStore.get(approvalId);
        if (!approval) {
          await context.reply(`Unknown approval id: ${approvalId}`);
          return;
        }

        if (approval.sessionKey !== session.sessionKey) {
          await context.reply("This approval belongs to a different channel session.");
          return;
        }

        if (approval.status !== "pending") {
          await context.reply(`Approval ${approvalId} is already ${approval.status}.`);
          return;
        }

        if (approval.expiresAt <= Date.now()) {
          await this.approvalStore.setStatus(approvalId, "expired");
          await context.reply(`Approval ${approvalId} has expired.`);
          return;
        }
        if (!this.isWorkspaceAllowed(approval.workspacePath)) {
          await this.approvalStore.setStatus(approvalId, "denied");
          await context.reply(
            `Denied: approval workspace is outside BRIDGE_WORKSPACE_ROOT (${this.config.workspaceRoot}).`,
          );
          return;
        }

        await this.approvalStore.setStatus(approvalId, "approved");
        await this.executeRun({
          context,
          sessionKey: session.sessionKey,
          provider: approval.provider,
          model: approval.model,
          reasoningEffort: approval.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
          prompt: approval.prompt,
          workspacePath: approval.workspacePath,
          startText: `Running #${approvalId} with ${approval.provider}/${approval.model} (${approval.reasoningEffort ?? DEFAULT_REASONING_EFFORT})...`,
          completeTitle: `Approval #${approvalId} completed`,
          failTitle: `Run failed for approval #${approvalId}`,
        });
        return;
      }
      case "deny": {
        if (!(await requireOwner(this.config, context.userId, context.reply))) {
          return;
        }
        const approvalId = parsed.args.trim();
        if (!approvalId) {
          await context.reply("Usage: /deny <approvalId>");
          return;
        }

        const approval = await this.approvalStore.get(approvalId);
        if (!approval) {
          await context.reply(`Unknown approval id: ${approvalId}`);
          return;
        }

        if (approval.sessionKey !== session.sessionKey) {
          await context.reply("This approval belongs to a different channel session.");
          return;
        }

        if (approval.status !== "pending") {
          await context.reply(`Approval ${approvalId} is already ${approval.status}.`);
          return;
        }

        await this.approvalStore.setStatus(approvalId, "denied");
        await context.reply(`Denied approval #${approvalId}.`);
        return;
      }
      default: {
        await context.reply(
          `Unknown command: /${parsed.name}\nTry !status or @homeclaw 상태\n\n${HELP_TEXT}`,
        );
      }
    }
  }
}
