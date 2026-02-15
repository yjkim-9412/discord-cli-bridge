import { describe, expect, it } from "vitest";
import { bindingKey, buildSessionKey, normalizeGuildId } from "./router.js";

describe("router utils", () => {
  it("builds binding keys", () => {
    expect(bindingKey("g1", "c1")).toBe("g1:c1");
  });

  it("builds session keys", () => {
    expect(buildSessionKey("g1", "c1")).toBe("discord:g1:c1");
  });

  it("normalizes dm guild id", () => {
    expect(normalizeGuildId(null)).toBe("dm");
  });
});
