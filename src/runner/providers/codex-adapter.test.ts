import { describe, expect, it } from "vitest";
import { buildCodexArgs, CodexAdapter } from "./codex-adapter.js";

describe("buildCodexArgs", () => {
  it("builds fresh exec args with model and reasoning", () => {
    const args = buildCodexArgs({
      model: "gpt-5.3-codex",
      prompt: "hello",
      reasoningEffort: "xhigh",
    });

    expect(args).toEqual([
      "exec",
      "--json",
      "--color",
      "never",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "-c",
      'reasoning.effort="xhigh"',
      "--model",
      "gpt-5.3-codex",
      "hello",
    ]);
  });

  it("builds resume args with resume session id", () => {
    const args = buildCodexArgs({
      model: "default",
      prompt: "continue",
      resumeSessionId: "thread-123",
      reasoningEffort: "high",
    });

    expect(args).toEqual([
      "exec",
      "resume",
      "--json",
      "--skip-git-repo-check",
      "-c",
      'reasoning.effort="high"',
      "thread-123",
      "continue",
    ]);
  });
});

describe("CodexAdapter", () => {
  it("supports reasoning", () => {
    const adapter = new CodexAdapter();
    expect(adapter.supportsReasoning()).toBe(true);
  });

  it("normalizes configured model list", () => {
    const adapter = new CodexAdapter();
    expect(adapter.listModels([" gpt-5.3-codex ", "Gpt-5.3-codex", "default"]))
      .toEqual(["gpt-5.3-codex", "default"]);
  });
});
