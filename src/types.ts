export type ProviderId = "codex" | "claude";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type ProviderModelCatalog = Partial<Record<ProviderId, string[]>>;

export type DefaultsConfig = {
  provider: ProviderId;
  model: string;
  models: ProviderModelCatalog;
  approvalTtlSec: number;
  runTimeoutMs: number;
};

export type ProjectConfig = {
  alias: string;
  path: string;
  provider?: ProviderId;
  model?: string;
};

export type BindingConfig = {
  guildId: string;
  channelId: string;
  project: string;
};

export type ResolvedConfig = {
  ownerDiscordUserId: string;
  botToken: string;
  defaults: DefaultsConfig;
  workspaceRoot?: string;
  stateDir: string;
  projectsByAlias: Map<string, ProjectConfig>;
  bindingsByKey: Map<string, BindingConfig>;
  shortcuts: Map<string, string>;
};

export type SessionState = {
  sessionKey: string;
  guildId: string;
  channelId: string;
  projectAlias: string;
  workspacePath: string;
  provider: ProviderId;
  model: string;
  reasoningEffort?: ReasoningEffort;
  cliSessionIds?: Partial<Record<ProviderId, string>>;
  lastRunAt?: number;
};

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export type ApprovalRequest = {
  approvalId: string;
  sessionKey: string;
  requestedBy: string;
  provider: ProviderId;
  model: string;
  reasoningEffort?: ReasoningEffort;
  workspacePath: string;
  prompt: string;
  createdAt: number;
  expiresAt: number;
  status: ApprovalStatus;
};

export type CliRunResult = {
  text: string;
  sessionId?: string;
  durationMs: number;
  contextLeftPercent?: number;
};
