import type { ProviderId } from "../../types.js";
import { ClaudeAdapter } from "./claude-adapter.js";
import { CodexAdapter } from "./codex-adapter.js";
import type { ProviderAdapter } from "./provider-adapter.js";

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  codex: new CodexAdapter(),
  claude: new ClaudeAdapter(),
};

export function getProviderAdapter(provider: ProviderId): ProviderAdapter {
  return ADAPTERS[provider];
}

export function listProviderAdapters(): ProviderAdapter[] {
  return Object.values(ADAPTERS);
}
