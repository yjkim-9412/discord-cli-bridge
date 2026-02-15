import { describe, expect, it } from "vitest";
import { parseCommandText, parseModelArgs, parseRunArgs } from "./command-parser.js";

describe("parseCommandText", () => {
  it("parses slash command and args", () => {
    expect(parseCommandText("/run --provider codex hello")).toEqual({
      name: "run",
      args: "--provider codex hello",
    });
  });

  it("parses bang command and args", () => {
    expect(parseCommandText("!status")).toEqual({
      name: "status",
      args: "",
    });
  });

  it("returns null for non-command text", () => {
    expect(parseCommandText("hello")).toBeNull();
  });

  it("returns null when command name is missing", () => {
    expect(parseCommandText("/")).toBeNull();
    expect(parseCommandText("!   ")).toBeNull();
  });
});

describe("parseRunArgs", () => {
  it("supports --provider option", () => {
    expect(parseRunArgs("--provider claude review this")).toEqual({
      providerOverride: "claude",
      prompt: "review this",
    });
  });

  it("supports provider= form", () => {
    expect(parseRunArgs("--provider=codex fix tests")).toEqual({
      providerOverride: "codex",
      prompt: "fix tests",
    });
  });

  it("returns prompt when provider is omitted", () => {
    expect(parseRunArgs("just do this")).toEqual({
      prompt: "just do this",
    });
  });

  it("fails on missing prompt", () => {
    const result = parseRunArgs("--provider codex");
    expect(result.error).toBeTruthy();
  });
});

describe("parseModelArgs", () => {
  it("parses model only", () => {
    expect(parseModelArgs("gpt-5.3-codex")).toEqual({
      model: "gpt-5.3-codex",
      reasoningEffort: undefined,
    });
  });

  it("parses reasoning with --reasoning option", () => {
    expect(parseModelArgs("gpt-5.3-codex --reasoning xhigh")).toEqual({
      model: "gpt-5.3-codex",
      reasoningEffort: "xhigh",
    });
  });

  it("parses trailing reasoning shorthand", () => {
    expect(parseModelArgs("gpt-5.3-codex high")).toEqual({
      model: "gpt-5.3-codex",
      reasoningEffort: "high",
    });
  });

  it("fails for invalid reasoning", () => {
    const result = parseModelArgs("gpt-5.3-codex --reasoning turbo");
    expect(result.error).toContain("Invalid reasoning level");
  });
});
