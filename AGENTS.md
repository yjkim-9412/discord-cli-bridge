# Repository Guidelines

## Project Overview

- Project: `discord-cli-bridge`
- Purpose: Discord 채널 메시지를 WSL 로컬 CLI 에이전트(`codex`, `claude`)로 라우팅하는 브리지
- Runtime: Node.js 22+, pnpm

## Architecture

- Entry: `src/index.ts`
- Discord bot + command routing: `src/discord-bot.ts`
- Config parsing/validation: `src/config.ts`
- Channel binding/session key: `src/router.ts`
- Provider adapter layer: `src/runner/providers/*`
  - Interface + shared runtime helpers: `provider-adapter.ts`
  - Codex implementation: `codex-adapter.ts`
  - Claude implementation: `claude-adapter.ts`
  - Adapter registry: `registry.ts`
- CLI execution facade: `src/runner/cli-runner.ts`
- Output parsing: `src/runner/output.ts`
- Runtime state store: `src/storage/*`
- Shared models/types: `src/types.ts`
- Config files: `config/projects.example.yml`, `config/projects.yml`

## Build / Test / Run

- Install: `pnpm install`
- Dev watch: `pnpm run dev`
- Start: `pnpm run start`
- Type check: `pnpm run check`
- Test: `pnpm run test`

## Command Behavior (Current)

- Text commands: `!help`, `!status`, `!models`, `!run ...`, `!provider ...`, `!model ...`, `!new`, `!exit` 등
- Slash commands: `/help`, `/status`, `/models`, `/run`, `/provider`, `/model`, `/new`, `/exit` 등
- Mention run: `@homeclaw <prompt>`
- Mention shortcut aliases: `@homeclaw status`, `@homeclaw codex status`, `@homeclaw 상태`, `@homeclaw models`, `@homeclaw reasoning`, `@homeclaw 추론`
- Owner run: 승인 없이 즉시 실행
- Non-owner run: approval queue 생성 후 owner 승인 필요
- Run 응답 하단에 `xx% context left` 표시

## Provider / Model / Reasoning Rules

- Provider 전환: `/provider <codex|claude>`
- Session default model 설정: `/model <model> [--reasoning low|medium|high|xhigh]`
- Model/Reasoning 목록 확인: `/models` 또는 `!models`
- 모델 목록은 `defaults.models`(config) 우선, 미설정 시 adapter fallback 사용
- Reasoning levels(codex): `low`, `medium`, `high`, `xhigh`
- Claude는 reasoning 값을 세션에 저장할 수 있지만 실행 시 무시
- `/new`는 **현재 session.provider의 세션 ID만** 초기화
- `/exit`는 **해당 채널 세션의 저장된 provider 세션을 전체 종료**

## Workspace / Mapping Rules

- 채널은 `config/projects.yml`의 `bindings`로 프로젝트 alias에 매핑
- 프로젝트 실제 경로는 `projects[].path`에서 관리
- `BRIDGE_WORKSPACE_ROOT`를 설정하면 루트 밖 경로 실행 차단

## Safety / Security

- 실제 토큰/시크릿을 코드에 하드코딩 금지
- `DISCORD_BOT_TOKEN`은 환경변수 우선 사용
- `projects.yml`은 민감 정보/개인 매핑이 포함될 수 있으므로 `.gitignore` 유지
- `state/*`는 런타임 아티팩트이며 커밋 대상 아님

## Edit Guidelines

- TypeScript strict 유지, `any` 회피
- 큰 리팩터링보다 작은 단위 변경 우선
- Discord 메시지 길이 제한 고려 (긴 메시지는 chunk 전송)
- 출력 메시지는 필요한 핵심 정보만 노출 (과도한 내부 메타 노출 금지)
- 명령/adapter 변경 시 아래를 함께 갱신:
  - `src/runner/providers/*`
  - `src/runner/cli-runner.ts`
  - `src/discord-bot.ts`
  - `README.md`
  - `AGENTS.md`

## Agent Notes

- 이 디렉터리의 `CLAUDE.md`는 `AGENTS.md` 심볼릭 링크를 유지
- 설정/동작 변경 시 README의 실행 예시도 함께 업데이트
