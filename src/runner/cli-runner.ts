import type { CliRunResult, ProviderId, ReasoningEffort } from "../types.js";
import type { ProcessManager } from "./process-manager.js";
import { getProviderAdapter } from "./providers/registry.js";

export async function runCli(params: {
  provider: ProviderId;
  model: string;
  prompt: string;
  workspacePath: string;
  timeoutMs: number;
  resumeSessionId?: string;
  reasoningEffort?: ReasoningEffort;
  processManager?: ProcessManager;
}): Promise<CliRunResult> {
  const adapter = getProviderAdapter(params.provider);
  return adapter.run({
    model: params.model,
    prompt: params.prompt,
    workspacePath: params.workspacePath,
    timeoutMs: params.timeoutMs,
    resumeSessionId: params.resumeSessionId,
    reasoningEffort: params.reasoningEffort,
    processManager: params.processManager,
  });
}

export function listModelsForProvider(params: {
  provider: ProviderId;
  configuredModels?: string[];
}): string[] {
  return getProviderAdapter(params.provider).listModels(params.configuredModels);
}

export function providerSupportsReasoning(provider: ProviderId): boolean {
  return getProviderAdapter(provider).supportsReasoning();
}
