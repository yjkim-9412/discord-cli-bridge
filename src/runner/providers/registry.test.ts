import { describe, expect, it } from "vitest";
import { getProviderAdapter, listProviderAdapters } from "./registry.js";

describe("provider registry", () => {
  it("returns codex and claude adapters", () => {
    const adapters = listProviderAdapters();
    const ids = adapters.map((adapter) => adapter.id).sort();
    expect(ids).toEqual(["claude", "codex"]);
  });

  it("returns adapter by provider id", () => {
    expect(getProviderAdapter("codex").id).toBe("codex");
    expect(getProviderAdapter("claude").id).toBe("claude");
  });
});
