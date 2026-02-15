import type { CliRunResult } from "../../types.js";
import { parseCliOutput } from "../output.js";
import {
  assertWorkspaceExists,
  executeCliCommand,
  normalizeModelList,
  type ProviderAdapter,
  type ProviderRunRequest,
} from "./provider-adapter.js";

const DEFAULT_CLAUDE_MODELS = ["default"];

export function buildClaudeArgs(params: {
  model: string;
  prompt: string;
}): string[] {
  const includeModel = params.model.trim() && params.model.trim().toLowerCase() !== "default";
  const args = ["-p", "--output-format", "json", "--dangerously-skip-permissions"];

  if (includeModel) {
    args.push("--model", params.model.trim());
  }

  args.push(params.prompt);
  return args;
}

export class ClaudeAdapter implements ProviderAdapter {
  readonly id = "claude" as const;

  listModels(configuredModels?: string[]): string[] {
    return normalizeModelList(configuredModels, DEFAULT_CLAUDE_MODELS);
  }

  supportsReasoning(): boolean {
    return false;
  }

  resolveContextWindowTokens(_model: string): number | undefined {
    return undefined;
  }

  async run(params: ProviderRunRequest): Promise<CliRunResult> {
    assertWorkspaceExists(params.workspacePath);

    const args = buildClaudeArgs({
      model: params.model,
      prompt: params.prompt,
    });

    const result = await executeCliCommand({
      command: "claude",
      args,
      workspacePath: params.workspacePath,
      timeoutMs: params.timeoutMs,
    });

    const parsed = parseCliOutput({
      provider: this.id,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    return {
      text: parsed.text,
      sessionId: parsed.sessionId,
      durationMs: result.durationMs,
      contextLeftPercent: undefined,
    };
  }
}
