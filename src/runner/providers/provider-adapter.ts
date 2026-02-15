import { spawn } from "node:child_process";
import fs from "node:fs";
import type { CliRunResult, ProviderId, ReasoningEffort } from "../../types.js";

export type ProviderRunRequest = {
  model: string;
  prompt: string;
  workspacePath: string;
  timeoutMs: number;
  resumeSessionId?: string;
  reasoningEffort?: ReasoningEffort;
};

export interface ProviderAdapter {
  readonly id: ProviderId;
  run(params: ProviderRunRequest): Promise<CliRunResult>;
  listModels(configuredModels?: string[]): string[];
  supportsReasoning(): boolean;
  resolveContextWindowTokens(model: string): number | undefined;
}

export function assertWorkspaceExists(workspacePath: string): void {
  if (!fs.existsSync(workspacePath)) {
    throw new Error(`Workspace does not exist: ${workspacePath}`);
  }
}

export async function executeCliCommand(params: {
  command: string;
  args: string[];
  workspacePath: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; durationMs: number }> {
  const startedAt = Date.now();
  const child = spawn(params.command, params.args, {
    cwd: params.workspacePath,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`CLI timed out after ${params.timeoutMs}ms.`));
    }, params.timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code ?? 0);
    });
  });

  if (exitCode !== 0) {
    const detail = stderr.trim() || stdout.trim() || "unknown CLI error";
    throw new Error(`${params.command} exited with code ${exitCode}: ${detail}`);
  }

  return {
    stdout,
    stderr,
    durationMs: Date.now() - startedAt,
  };
}

export function calculateContextLeftPercent(params: {
  windowTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}): number | undefined {
  if (!params.windowTokens || params.windowTokens <= 0) {
    return undefined;
  }
  if (params.inputTokens == null || params.outputTokens == null) {
    return undefined;
  }

  const used = params.inputTokens + params.outputTokens;
  const remaining = Math.max(0, params.windowTokens - used);
  return Math.round((remaining / params.windowTokens) * 100);
}

export function normalizeModelList(configuredModels: string[] | undefined, fallback: string[]): string[] {
  const source = configuredModels && configuredModels.length > 0 ? configuredModels : fallback;
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
