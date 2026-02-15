import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SessionStore } from "./session-store.js";

function createTempStateDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "discord-cli-bridge-session-store-"));
}

describe("SessionStore resetProviderSession", () => {
  it("clears only the selected provider session id", async () => {
    const stateDir = createTempStateDir();
    const store = new SessionStore(stateDir);

    const created = await store.getOrCreate({
      sessionKey: "discord:g1:c1",
      guildId: "g1",
      channelId: "c1",
      projectAlias: "app",
      workspacePath: "/tmp/app",
      provider: "codex",
      model: "gpt-5.3-codex",
      reasoningEffort: "xhigh",
    });

    created.cliSessionIds = {
      codex: "codex-thread-id",
      claude: "claude-session-id",
    };
    await store.update(created);

    const updated = await store.resetProviderSession(created.sessionKey, "codex");
    expect(updated.cliSessionIds?.codex).toBeUndefined();
    expect(updated.cliSessionIds?.claude).toBe("claude-session-id");
  });
});
