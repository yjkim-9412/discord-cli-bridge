import { describe, expect, it } from "vitest";
import { buildClaudeArgs, ClaudeAdapter } from "./claude-adapter.js";

describe("buildClaudeArgs", () => {
  it("builds args with model", () => {
    const args = buildClaudeArgs({
      model: "claude-3-7-sonnet",
      prompt: "summarize",
    });

    expect(args).toEqual([
      "-p",
      "--output-format",
      "json",
      "--dangerously-skip-permissions",
      "--model",
      "claude-3-7-sonnet",
      "summarize",
    ]);
  });

  it("omits model when default", () => {
    const args = buildClaudeArgs({
      model: "default",
      prompt: "summarize",
    });

    expect(args).toEqual([
      "-p",
      "--output-format",
      "json",
      "--dangerously-skip-permissions",
      "summarize",
    ]);
  });
});

describe("ClaudeAdapter", () => {
  it("does not support reasoning", () => {
    const adapter = new ClaudeAdapter();
    expect(adapter.supportsReasoning()).toBe(false);
  });

  it("uses configured model list when provided", () => {
    const adapter = new ClaudeAdapter();
    expect(adapter.listModels(["default", "default", "claude-opus"])).toEqual([
      "default",
      "claude-opus",
    ]);
  });
});
