# discord-cli-bridge

디스코드 채널에서 `codex`/`claude` CLI를 WSL 로컬 프로젝트에 연결해 실행하는 브리지입니다.

## 1) 요구사항

- Node.js 22+
- pnpm
- Discord Bot Token
- `codex` 또는 `claude` CLI가 PATH에 있어야 함

## 2) 설치

```bash
pnpm install
```

## 3) 설정 파일 준비

```bash
cp config/projects.example.yml config/projects.yml
```

`config/projects.yml`에서 아래를 설정하세요.

- `owner.discordUserId`: owner 사용자 ID
- `projects[].path`: 실제 작업 디렉터리
- `bindings[]`: `guildId`/`channelId`와 project alias 매핑
- `defaults.models`: provider별 모델 목록 (`/models` 출력에 사용)

## 4) 환경변수 설정

```bash
export DISCORD_BOT_TOKEN="YOUR_DISCORD_BOT_TOKEN"
export BRIDGE_WORKSPACE_ROOT="/path/to/your/workspaces"
```

- `BRIDGE_WORKSPACE_ROOT`를 설정하면 이 경로 밖 작업은 차단됩니다.

## 5) 실행

```bash
pnpm run start
```

정상 실행 시 로그 예시:

- `Bridge online as ...`
- `Registered ... slash commands for guild ...`

## 6) 주요 명령

### 상태/도움말

- `/help` 또는 `!help`
- `/status` 또는 `!status`
- `/models` 또는 `!models` (config 기반 모델 목록 + reasoning 정책)
- 멘션 기반 상태 조회: `@homeclaw status`, `@homeclaw codex status`, `@homeclaw 상태`

### 숏컷(Shortcut) 등록

- `config/projects.yml`의 `shortcuts`에 별칭을 추가하면 텍스트/멘션에서 바로 사용 가능
- 예시:

```yaml
shortcuts:
  s: status
  상태: status
  m: model
  ml: models
  n: new
```

### 실행

- 멘션 실행: `@homeclaw hi`
- 명령 실행: `/run <prompt>` 또는 `!run <prompt>`
- provider 오버라이드: `!run --provider claude <prompt>`

### Provider 전환

- `/provider <codex|claude>` 또는 `!provider <codex|claude>`

### 모델/추론 설정

- `/models` 또는 `!models`
- `/model <model> [--reasoning low|medium|high|xhigh]`
- 예시:

```bash
!model gpt-5.3-codex --reasoning xhigh
```

- 참고: Claude provider는 reasoning 값을 세션에 저장하지만 실행 시에는 무시합니다.

### 세션

- `/new` 또는 `!new`
- 현재 동작: **현재 선택된 provider의 세션 ID만 초기화**

## 7) 현재 동작 요약

- owner가 보낸 run/멘션은 승인 없이 즉시 실행
- non-owner run은 approval 생성 후 owner 승인 필요
- run 응답 하단에 `xx% context left` 표시

## 8) 트러블슈팅

### `/status`가 `Unknown command`로 뜰 때

- `!status`를 사용
- 또는 `@homeclaw codex status` 사용

### 모델 미지원 에러

- ChatGPT 계정에서는 `codex5.3` 대신 `gpt-5.3-codex` 사용

## 9) 라이선스

- MIT (`LICENSE`)

## 10) 테스트

```bash
pnpm run check
pnpm run test
```
