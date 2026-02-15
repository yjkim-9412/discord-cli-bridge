# discord-cli-bridge

> Bridge Discord channels to local CLI coding agents (`codex` / `claude`) running on your PC via WSL.

[English](README.md) | [한국어](README.ko.md)

## Motivation

Inspired by workflows that use iMessage to remotely trigger Claude Code or Codex on a Mac. Since this project targets a **Windows + WSL** environment where iMessage isn't available, Discord serves as the cross-platform bridge to achieve the same remote-control experience for CLI coding agents.

## Features

- **Three input modes** — Slash commands (`/run`), text commands (`!run`), and mentions (`@bot prompt`)
- **Per-channel sessions** — Each channel maintains its own provider, model, reasoning level, and CLI session
- **Multi-provider** — Switch between Codex and Claude on the fly with `/provider`
- **Approval workflow** — Non-owners must get owner approval before execution; owner runs instantly
- **Workspace isolation** — Channels are bound to specific project directories via config

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm
- Discord Bot Token
- `codex` or `claude` CLI installed and available in PATH

### Setup

```bash
# Install dependencies
pnpm install

# Create config from template
cp config/projects.example.yml config/projects.yml

# Set environment variables
export DISCORD_BOT_TOKEN="YOUR_DISCORD_BOT_TOKEN"
export BRIDGE_WORKSPACE_ROOT="/path/to/your/workspaces"  # optional, restricts execution scope
```

Edit `config/projects.yml` with your values:

```yaml
owner:
  discordUserId: "YOUR_OWNER_DISCORD_USER_ID"

defaults:
  provider: codex
  model: default
  models:
    codex:
      - gpt-5.3-codex
      - default
    claude:
      - default
  approvalTtlSec: 600
  runTimeoutMs: 600000

projects:
  - alias: my-studio
    path: /path/to/your/workspaces/my-studio
    provider: codex
    model: default

bindings:
  - guildId: "YOUR_GUILD_ID"
    channelId: "YOUR_CHANNEL_ID"
    project: my-studio
```

### Run

```bash
pnpm run start     # single run
pnpm run dev       # watch mode
```

Successful startup logs: `Bridge online as ...` and `Registered ... slash commands for guild ...`

## Command Reference

### Info & Status

| Command | Description | Example |
|---|---|---|
| `/help` `!help` | Show available commands | |
| `/status` `!status` | Current session state | `@bot status` |
| `/models` `!models` | List available models | `@bot models` |

### Execution

| Command | Description | Example |
|---|---|---|
| `/run <prompt>` `!run <prompt>` | Execute a prompt | `/run fix the login bug` |
| `@bot <prompt>` | Run via mention | `@bot add unit tests` |
| `!run --provider claude <prompt>` | Override provider for this run | |

### Configuration (Owner Only)

| Command | Description | Example |
|---|---|---|
| `/provider <codex\|claude>` | Switch provider | `/provider claude` |
| `/model <model>` | Set model | `!model gpt-5.3-codex --reasoning xhigh` |
| `/new` | Reset current provider session | |
| `/exit` | End channel session (clear all stored provider sessions) | |
| `/approve <id>` | Approve a pending request | |
| `/deny <id>` | Deny a pending request | |

> **Note:** Reasoning levels (`low`, `medium`, `high`, `xhigh`) are supported by Codex. Claude stores the value in session but ignores it during execution.

## Configuration Guide

### Channel Bindings

Channels must be explicitly bound to projects in `config/projects.yml`. Unbound channels are rejected.

```yaml
bindings:
  - guildId: "111111111111111111"
    channelId: "222222222222222222"
    project: my-studio
```

### Shortcuts

Add text/mention aliases in `config/projects.yml`:

```yaml
shortcuts:
  s: status
  m: model
  n: new
  ml: models
```

## Architecture

```mermaid
flowchart LR
  A[Discord Message] --> B[Command Parser]
  B --> C[Router / Session]
  C --> D{Command Type}
  D -->|run / mention| E[Provider Adapter]
  D -->|config| F[Session Store]
  E --> G[CLI Spawn via WSL]
  G --> H[Output Parser]
  H --> I[Discord Reply]
```

Key components:

- **Command routing & orchestration** — `src/discord-bot.ts`
- **Provider adapter interface** — `src/runner/providers/provider-adapter.ts`
- **Provider implementations** — `codex-adapter.ts`, `claude-adapter.ts`
- **Output parsing** — `src/runner/output.ts` (JSON/JSONL extraction)
- **Session persistence** — `src/storage/session-store.ts`
- **Approval workflow** — `src/storage/approval-store.ts`

## Security

- Use `DISCORD_BOT_TOKEN` env var — never hardcode tokens
- `config/projects.yml` is gitignored — contains local-specific mappings
- Set `BRIDGE_WORKSPACE_ROOT` to restrict execution paths

## Troubleshooting

### Slash commands show as "Unknown command"

- Try text commands first (`!status`, `!models`)
- Slash commands may take a few seconds to register after restart
- Check for `Registered ... slash commands ...` in startup logs

### Model errors

- Use exact model names (e.g., `gpt-5.3-codex`)

## Terms of Service

By using this software, you agree to the [Terms of Service](TERMS_OF_SERVICE.md). The software executes CLI tools on your local machine — please review the security disclosure before use.

## License

MIT
