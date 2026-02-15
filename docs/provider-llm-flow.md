# Provider to LLM Flow

이 문서는 디스코드 채팅 입력부터 provider 선택, CLI 실행, LLM 응답 전달까지의 흐름을 설명합니다.

## End-to-End Flow

```mermaid
flowchart TD
  A[Discord 메시지/슬래시 수신] --> B[command-parser + shortcut 해석]
  B --> C[채널 바인딩으로 Session 조회/생성]
  C --> D{명령 종류}

  D -->|/provider| E[session.provider 변경 저장]
  D -->|/model| F[session.model/reasoning 저장]
  D -->|/new| G[현재 provider 세션 ID만 reset]
  D -->|/models| H[defaults.models + adapter fallback 목록 출력]

  D -->|/run or 멘션| I[provider 결정: override 또는 session.provider]
  I --> J[ProviderAdapter 선택 (registry)]
  J --> K[adapter가 provider별 CLI args 구성]
  K --> L[WSL에서 codex 또는 claude CLI 실행]
  L --> M[provider별 출력 파싱 + sessionId 추출]
  M --> N[SessionStore에 provider별 sessionId/lastRun 저장]
  N --> O[Discord로 실행 결과 + context left 전송]
```

## 핵심 컴포넌트 매핑

- 명령/라우팅: `src/discord-bot.ts`
- 실행 퍼사드: `src/runner/cli-runner.ts`
- provider 인터페이스: `src/runner/providers/provider-adapter.ts`
- provider 구현체:
  - `src/runner/providers/codex-adapter.ts`
  - `src/runner/providers/claude-adapter.ts`
- provider 선택 레지스트리: `src/runner/providers/registry.ts`
- 출력 파서: `src/runner/output.ts`
- 세션 저장: `src/storage/session-store.ts`

## 정책 요약

- `/provider`로 채널 기본 provider를 전환 가능
- `/new`는 현재 선택 provider 세션만 초기화
- Claude는 reasoning 값을 저장할 수 있으나 실행 시에는 무시
- 모델 목록은 `config/projects.yml`의 `defaults.models` 우선
