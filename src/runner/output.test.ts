import { describe, expect, it } from "vitest";
import { parseCliOutput } from "./output.js";

describe("parseCliOutput", () => {
  it("extracts codex assistant text and usage tokens from JSONL", () => {
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "t1" }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "i1", type: "agent_message", text: "Hello from codex" },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 1200, cached_input_tokens: 300, output_tokens: 80 },
      }),
      "",
    ].join("\n");

    const parsed = parseCliOutput({
      provider: "codex",
      stdout,
      stderr: "",
    });

    expect(parsed.text).toBe("Hello from codex");
    expect(parsed.sessionId).toBe("t1");
    expect(parsed.inputTokens).toBe(1200);
    expect(parsed.outputTokens).toBe(80);
  });
});
