import type { CliRunResult, ReasoningEffort } from "../../types.js";
import { parseCliOutput } from "../output.js";
import {
  assertWorkspaceExists,
  calculateContextLeftPercent,
  executeCliCommand,
  normalizeModelList,
  type ProviderAdapter,
  type ProviderRunRequest,
} from "./provider-adapter.js";

const DEFAULT_CODEX_MODELS = ["gpt-5.3-codex", "default"];
const DEFAULT_REASONING_EFFORT: ReasoningEffort = "xhigh";

export function buildCodexArgs(params: {
  model: string;
  prompt: string;
  resumeSessionId?: string;
  reasoningEffort?: ReasoningEffort;
}): string[] {
  const includeModel = params.model.trim() && params.model.trim().toLowerCase() !== "default";
  const reasoningEffort = params.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
  const resumeSessionId = params.resumeSessionId?.trim();

  const args = resumeSessionId
    ? ["exec", "resume", "--json", "--skip-git-repo-check", "-c", `reasoning.effort=\"${reasoningEffort}\"`]
    : [
        "exec",
        "--json",
        "--color",
        "never",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "-c",
        `reasoning.effort=\"${reasoningEffort}\"`,
      ];

  if (includeModel) {
    args.push("--model", params.model.trim());
  }

  if (resumeSessionId) {
    args.push(resumeSessionId);
  }

  args.push(params.prompt);
  return args;
}

export class CodexAdapter implements ProviderAdapter {
  readonly id = "codex" as const;

  listModels(configuredModels?: string[]): string[] {
    return normalizeModelList(configuredModels, DEFAULT_CODEX_MODELS);
  }

  supportsReasoning(): boolean {
    return true;
  }

  resolveContextWindowTokens(_model: string): number | undefined {
    return 200_000;
  }

  async run(params: ProviderRunRequest): Promise<CliRunResult> {
    assertWorkspaceExists(params.workspacePath);

    const args = buildCodexArgs({
      model: params.model,
      prompt: params.prompt,
      resumeSessionId: params.resumeSessionId,
      reasoningEffort: params.reasoningEffort,
    });

    const result = await executeCliCommand({
      command: "codex",
      args,
      workspacePath: params.workspacePath,
      timeoutMs: params.timeoutMs,
      processManager: params.processManager,
    });

    const parsed = parseCliOutput({
      provider: this.id,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    const contextLeftPercent = calculateContextLeftPercent({
      windowTokens: this.resolveContextWindowTokens(params.model),
      inputTokens: parsed.inputTokens,
      outputTokens: parsed.outputTokens,
    });

    return {
      text: parsed.text,
      sessionId: parsed.sessionId,
      durationMs: result.durationMs,
      contextLeftPercent,
    };
  }
}
