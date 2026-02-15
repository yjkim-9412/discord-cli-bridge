import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isPathWithinRoot, loadConfig } from "./config.js";

const ENV_KEYS = ["DISCORD_BOT_TOKEN", "BRIDGE_WORKSPACE_ROOT"] as const;

function writeConfigFile(params: { projectPath: string; defaultsYaml?: string[] }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "discord-cli-bridge-config-"));
  const configPath = path.join(dir, "projects.yml");
  const yaml = [
    "owner:",
    "  discordUserId: \"123456789012345678\"",
    ...(params.defaultsYaml ?? []),
    "projects:",
    "  - alias: app",
    `    path: ${params.projectPath}`,
    "bindings:",
    "  - guildId: \"g1\"",
    "    channelId: \"c1\"",
    "    project: app",
    "",
  ].join("\n");
  fs.writeFileSync(configPath, yaml, "utf8");
  return configPath;
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe("isPathWithinRoot", () => {
  it("returns true for direct child paths", () => {
    expect(isPathWithinRoot("/tmp/workspace/project", "/tmp/workspace")).toBe(true);
  });

  it("returns false for paths outside root", () => {
    expect(isPathWithinRoot("/tmp/other/project", "/tmp/workspace")).toBe(false);
  });
});

describe("loadConfig workspace root restriction", () => {
  it("accepts projects inside BRIDGE_WORKSPACE_ROOT", () => {
    process.env.DISCORD_BOT_TOKEN = "token";
    process.env.BRIDGE_WORKSPACE_ROOT = "/tmp/allowed";
    const configPath = writeConfigFile({ projectPath: "/tmp/allowed/project-a" });

    const config = loadConfig(configPath);
    expect(config.workspaceRoot).toBe(path.resolve("/tmp/allowed"));
    expect(config.projectsByAlias.get("app")?.path).toBe(path.resolve("/tmp/allowed/project-a"));
  });

  it("rejects projects outside BRIDGE_WORKSPACE_ROOT", () => {
    process.env.DISCORD_BOT_TOKEN = "token";
    process.env.BRIDGE_WORKSPACE_ROOT = "/tmp/allowed";
    const configPath = writeConfigFile({ projectPath: "/tmp/blocked/project-a" });

    expect(() => loadConfig(configPath)).toThrow(/outside BRIDGE_WORKSPACE_ROOT/);
  });

  it("loads and normalizes shortcuts map", () => {
    process.env.DISCORD_BOT_TOKEN = "token";
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "discord-cli-bridge-shortcuts-"));
    const configPath = path.join(dir, "projects.yml");
    const yaml = [
      "owner:",
      "  discordUserId: \"123456789012345678\"",
      "shortcuts:",
      "  \"  S  \": \"status\"",
      "  \"Codex   Status\": \"status\"",
      "projects:",
      "  - alias: app",
      "    path: /tmp/allowed/project-a",
      "bindings:",
      "  - guildId: \"g1\"",
      "    channelId: \"c1\"",
      "    project: app",
      "",
    ].join("\n");
    fs.writeFileSync(configPath, yaml, "utf8");

    const config = loadConfig(configPath);
    expect(config.shortcuts.get("s")).toBe("status");
    expect(config.shortcuts.get("codex status")).toBe("status");
  });

  it("loads configured model catalog and removes duplicates", () => {
    process.env.DISCORD_BOT_TOKEN = "token";
    const configPath = writeConfigFile({
      projectPath: "/tmp/allowed/project-a",
      defaultsYaml: [
        "defaults:",
        "  models:",
        "    codex:",
        "      - gpt-5.3-codex",
        "      - gpt-5.3-codex",
        "      - default",
        "    claude:",
        "      - default",
      ],
    });

    const config = loadConfig(configPath);
    expect(config.defaults.models.codex).toEqual(["gpt-5.3-codex", "default"]);
    expect(config.defaults.models.claude).toEqual(["default"]);
  });
});
