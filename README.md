# discord-cli-bridge

디스코드 채널에서 `codex`/`claude` CLI를 WSL 로컬 프로젝트와 연결해 실행하는 브리지입니다.

## 왜 만들었나

- 모바일 디스코드만으로 집/사무실 PC의 CLI 코딩 에이전트를 호출하기 위해
- 채널별로 프로젝트를 고정 매핑해, 실수로 다른 저장소에서 실행되는 문제를 줄이기 위해
- `provider`/`model`/`reasoning` 전환을 채팅 명령으로 제어하기 위해

## 사용자 친화적으로 구성한 이유

- **입력 방식 통일**: 슬래시(`/...`), 텍스트(`!...`), 멘션(`@bot ...`) 모두 지원
- **채널 세션 유지**: 채널마다 provider/model/session 상태를 저장
- **안전 장치**: owner 승인 플로우 + `BRIDGE_WORKSPACE_ROOT` 경로 제한
- **즉시 상태 확인**: `/status`, `/models`로 현재 상태를 한 번에 확인

## 핵심 기능

- Provider 전환: `/provider <codex|claude>`
- 모델/추론 설정: `/model <model> [--reasoning low|medium|high|xhigh]`
- 모델 목록 확인: `/models`
- 세션 초기화: `/new` (현재 provider 세션만 초기화)
- 실행: `/run <prompt>` 또는 `@homeclaw <prompt>`

## 빠른 시작

### 1) 요구사항

- Node.js 22+
- pnpm
- Discord Bot Token
- `codex` 또는 `claude` CLI가 PATH에 설치되어 있어야 함

### 2) 설치

```bash
pnpm install
```

### 3) 설정 파일 생성

```bash
cp config/projects.example.yml config/projects.yml
```

### 4) `config/projects.yml` 작성

아래 값들을 본인 환경에 맞게 입력하세요.

- `owner.discordUserId`: owner 디스코드 사용자 ID
- `projects[].path`: 실제 작업 디렉터리
- `bindings[]`: `guildId`/`channelId` -> project alias 매핑
- `defaults.models`: provider별 모델 목록(`/models` 출력에 사용)

예시:

```yaml
owner:
  discordUserId: "YOUR_OWNER_DISCORD_USER_ID"

defaults:
  provider: codex
  model: gpt-5.3-codex
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
    model: gpt-5.3-codex

bindings:
  - guildId: "YOUR_GUILD_ID"
    channelId: "YOUR_CHANNEL_ID"
    project: my-studio
```

### 5) 환경변수 설정

```bash
export DISCORD_BOT_TOKEN="YOUR_DISCORD_BOT_TOKEN"
export BRIDGE_WORKSPACE_ROOT="/path/to/your/workspaces"
```

- `BRIDGE_WORKSPACE_ROOT`를 설정하면 해당 루트 밖 작업은 차단됩니다.

### 6) 실행

```bash
pnpm run start
```

정상 실행 로그:

- `Bridge online as ...`
- `Registered ... slash commands for guild ...`

## 사용법 (실전)

### 상태 확인

- `/help` 또는 `!help`
- `/status` 또는 `!status`
- `/models` 또는 `!models`
- 멘션: `@homeclaw status`, `@homeclaw models`, `@homeclaw 상태`

### 실행

- 멘션 실행: `@homeclaw hi`
- 명령 실행: `/run <prompt>` 또는 `!run <prompt>`
- provider 오버라이드: `!run --provider claude <prompt>`

### provider/model 전환

- provider 전환: `/provider codex` 또는 `/provider claude`
- 모델/추론 설정: `!model gpt-5.3-codex --reasoning xhigh`

참고:

- Claude provider는 reasoning 값을 세션에 저장할 수 있지만 실행 시에는 무시합니다.
- `/new`는 현재 선택된 provider의 세션만 초기화합니다.

## 숏컷 등록

`config/projects.yml`의 `shortcuts`에 별칭을 추가하면 텍스트/멘션에서 바로 사용 가능합니다.

```yaml
shortcuts:
  s: status
  상태: status
  ml: models
  p: provider
  m: model
  n: new
```

## 보안 권장사항

- Bot token은 코드에 하드코딩하지 말고 `DISCORD_BOT_TOKEN` 환경변수 사용
- `config/projects.yml`는 로컬 전용으로 유지 (Git ignore 대상)
- `BRIDGE_WORKSPACE_ROOT`를 반드시 설정해 실행 경로를 제한

## 트러블슈팅

### `/status` 또는 `/models`가 `Unknown command`로 보일 때

- 먼저 `!status`, `!models`로 확인
- 슬래시 명령은 반영까지 수십 초 걸릴 수 있으므로 잠시 후 재시도
- 서버 재시작 후 `Registered ... slash commands ...` 로그 확인

### 모델 관련 오류

- Codex 계열 사용 시 모델명을 `gpt-5.3-codex`처럼 정확히 입력

## 라이선스

- MIT (`LICENSE`)

## 테스트

```bash
pnpm run check
pnpm run test
```
