import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type {
  BindingConfig,
  DefaultsConfig,
  ProjectConfig,
  ProviderId,
  ProviderModelCatalog,
  ResolvedConfig,
} from "./types.js";

const ProviderSchema = z.enum(["codex", "claude"]);
const ProviderModelCatalogSchema = z
  .object({
    codex: z.array(z.string().min(1)).optional(),
    claude: z.array(z.string().min(1)).optional(),
  })
  .optional();

const DefaultsSchema = z
  .object({
    provider: ProviderSchema.optional(),
    model: z.string().optional(),
    models: ProviderModelCatalogSchema,
    approvalTtlSec: z.number().int().positive().optional(),
    runTimeoutMs: z.number().int().positive().optional(),
  })
  .optional();

const ProjectSchema = z.object({
  alias: z.string().min(1),
  path: z.string().min(1),
  provider: ProviderSchema.optional(),
  model: z.string().optional(),
});

const BindingSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  project: z.string().min(1),
});

const RawConfigSchema = z.object({
  owner: z.object({
    discordUserId: z.string().min(1),
  }),
  discord: z
    .object({
      botToken: z.string().min(1).optional(),
    })
    .optional(),
  defaults: DefaultsSchema,
  stateDir: z.string().optional(),
  shortcuts: z.record(z.string()).optional(),
  projects: z.array(ProjectSchema).min(1),
  bindings: z.array(BindingSchema).min(1),
});

type RawConfig = z.infer<typeof RawConfigSchema>;

const DEFAULT_MODEL_CATALOG: Record<ProviderId, string[]> = {
  codex: ["gpt-5.3-codex", "default"],
  claude: ["default"],
};

const DEFAULTS: DefaultsConfig = {
  provider: "codex",
  model: "default",
  models: {
    codex: [...DEFAULT_MODEL_CATALOG.codex],
    claude: [...DEFAULT_MODEL_CATALOG.claude],
  },
  approvalTtlSec: 600,
  runTimeoutMs: 600_000,
};

function bindingKey(guildId: string, channelId: string): string {
  return `${guildId}:${channelId}`;
}

function loadRawConfig(configPath: string): RawConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = YAML.parse(raw);
  return RawConfigSchema.parse(parsed);
}

function resolveWorkspaceRootFromEnv(): string | undefined {
  const raw = process.env.BRIDGE_WORKSPACE_ROOT?.trim();
  if (!raw) {
    return undefined;
  }
  return path.resolve(raw);
}

function normalizeShortcutKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeModelList(raw: string[] | undefined, fallback: string[]): string[] {
  const source = raw && raw.length > 0 ? raw : fallback;
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of source) {
    const model = item.trim();
    if (!model) {
      continue;
    }
    const key = model.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(model);
  }

  return normalized;
}

function resolveModelCatalog(rawModels: ProviderModelCatalog | undefined): ProviderModelCatalog {
  const models: ProviderModelCatalog = {};

  for (const provider of ["codex", "claude"] as const) {
    models[provider] = normalizeModelList(rawModels?.[provider], DEFAULT_MODEL_CATALOG[provider]);
  }

  return models;
}

export function isPathWithinRoot(targetPath: string, workspaceRoot: string): boolean {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedRoot === resolvedTarget) {
    return true;
  }
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function loadConfig(configPath?: string): ResolvedConfig {
  const finalPath =
    configPath ?? process.env.BRIDGE_CONFIG ?? path.join(process.cwd(), "config", "projects.yml");

  const raw = loadRawConfig(finalPath);
  const botToken = process.env.DISCORD_BOT_TOKEN ?? raw.discord?.botToken;
  if (!botToken || !botToken.trim()) {
    throw new Error("Missing Discord bot token. Set DISCORD_BOT_TOKEN or discord.botToken.");
  }

  const defaults: DefaultsConfig = {
    provider: raw.defaults?.provider ?? DEFAULTS.provider,
    model: raw.defaults?.model ?? DEFAULTS.model,
    models: resolveModelCatalog(raw.defaults?.models),
    approvalTtlSec: raw.defaults?.approvalTtlSec ?? DEFAULTS.approvalTtlSec,
    runTimeoutMs: raw.defaults?.runTimeoutMs ?? DEFAULTS.runTimeoutMs,
  };
  const workspaceRoot = resolveWorkspaceRootFromEnv();

  const projectsByAlias = new Map<string, ProjectConfig>();
  for (const project of raw.projects) {
    const alias = project.alias.trim();
    if (projectsByAlias.has(alias)) {
      throw new Error(`Duplicate project alias: ${alias}`);
    }
    const resolvedProjectPath = path.resolve(project.path);
    if (workspaceRoot && !isPathWithinRoot(resolvedProjectPath, workspaceRoot)) {
      throw new Error(
        `Project "${alias}" path is outside BRIDGE_WORKSPACE_ROOT: ${resolvedProjectPath}`,
      );
    }
    projectsByAlias.set(alias, {
      ...project,
      alias,
      path: resolvedProjectPath,
    });
  }

  const bindingsByKey = new Map<string, BindingConfig>();
  for (const binding of raw.bindings) {
    if (!projectsByAlias.has(binding.project)) {
      throw new Error(
        `Binding references unknown project "${binding.project}" (${binding.guildId}/${binding.channelId}).`,
      );
    }

    const key = bindingKey(binding.guildId, binding.channelId);
    if (bindingsByKey.has(key)) {
      throw new Error(`Duplicate binding for guild/channel: ${key}`);
    }

    bindingsByKey.set(key, binding);
  }

  const shortcuts = new Map<string, string>();
  for (const [rawKey, rawValue] of Object.entries(raw.shortcuts ?? {})) {
    const key = normalizeShortcutKey(rawKey);
    const value = rawValue.trim();
    if (!key || !value) {
      continue;
    }
    shortcuts.set(key, value);
  }

  const stateDir = path.resolve(raw.stateDir ?? path.join(process.cwd(), "state"));

  return {
    ownerDiscordUserId: raw.owner.discordUserId,
    botToken: botToken.trim(),
    defaults,
    workspaceRoot,
    stateDir,
    projectsByAlias,
    bindingsByKey,
    shortcuts,
  };
}

export function resolveDefaultProviderModel(params: {
  config: ResolvedConfig;
  projectAlias: string;
}): { provider: DefaultsConfig["provider"]; model: string; workspacePath: string } {
  const project = params.config.projectsByAlias.get(params.projectAlias);
  if (!project) {
    throw new Error(`Unknown project alias: ${params.projectAlias}`);
  }

  return {
    provider: project.provider ?? params.config.defaults.provider,
    model: project.model ?? params.config.defaults.model,
    workspacePath: project.path,
  };
}
