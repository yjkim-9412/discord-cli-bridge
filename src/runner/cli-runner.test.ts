import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliRunResult } from "../types.js";
import { ProcessManager } from "./process-manager.js";
import { listModelsForProvider, providerSupportsReasoning, runCli } from "./cli-runner.js";
import { getProviderAdapter } from "./providers/registry.js";

vi.mock("./providers/registry.js", () => ({
  getProviderAdapter: vi.fn(),
}));

describe("cli-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards run params including process manager to adapter", async () => {
    const expected: CliRunResult = {
      text: "ok",
      durationMs: 123,
      sessionId: "session-1",
      contextLeftPercent: 88,
    };
    const run = vi.fn(async () => expected);

    vi.mocked(getProviderAdapter).mockReturnValue({
      id: "codex",
      run,
      listModels: () => ["gpt-5.3-codex"],
      supportsReasoning: () => true,
      resolveContextWindowTokens: () => 200_000,
    });

    const processManager = new ProcessManager();
    const result = await runCli({
      provider: "codex",
      model: "gpt-5.3-codex",
      prompt: "hello",
      workspacePath: "/tmp",
      timeoutMs: 1_000,
      resumeSessionId: "resume-1",
      reasoningEffort: "xhigh",
      processManager,
    });

    expect(result).toEqual(expected);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      model: "gpt-5.3-codex",
      prompt: "hello",
      workspacePath: "/tmp",
      timeoutMs: 1_000,
      resumeSessionId: "resume-1",
      reasoningEffort: "xhigh",
      processManager,
    });
  });

  it("returns configured models through adapter", () => {
    vi.mocked(getProviderAdapter).mockReturnValue({
      id: "claude",
      run: vi.fn(),
      listModels: () => ["default", "claude-3-7-sonnet"],
      supportsReasoning: () => false,
      resolveContextWindowTokens: () => undefined,
    });

    const models = listModelsForProvider({
      provider: "claude",
      configuredModels: ["default", "claude-3-7-sonnet"],
    });

    expect(models).toEqual(["default", "claude-3-7-sonnet"]);
  });

  it("returns reasoning support from adapter", () => {
    vi.mocked(getProviderAdapter).mockReturnValue({
      id: "codex",
      run: vi.fn(),
      listModels: () => ["gpt-5.3-codex"],
      supportsReasoning: () => true,
      resolveContextWindowTokens: () => 200_000,
    });

    expect(providerSupportsReasoning("codex")).toBe(true);
  });
});
