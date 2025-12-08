# 폴더: src

## 역할
이 디렉터리는 Viper VS Code 확장의 모든 소스 코드가 위치하는 루트 디렉터리입니다.

## 구조 개요
- **`extension.ts`** – 확장의 루트 진입점입니다. VS Code 활성화 시점을 받아 `vs/ai-partner/extension.ts`로 위임하고, 시크릿 스토리지를 초기화합니다.
- **`vs/`** – VS Code 호스트 API에 강하게 의존하는 기능들이 위치하는 네임스페이스입니다. 현재는 거의 전부 `ai-partner` 서브시스템이 이 안에 있습니다.
- **`test/`** – 확장 전역에 대한 기본 테스트(`extension.test.ts` 등)를 포함합니다. AI 파트너 전용 테스트는 `vs/ai-partner/testing/` 아래에 있습니다.

## AI 분석 가이드
- 확장이 어떻게 활성화되고 AI 파트너로 위임되는지 이해하려면 `extension.ts`부터 읽으세요.
- 그 다음 `vs/ai-partner/_folder_overview.md`로 이동해 Orchestrator, Model Context Protocol (MCP), A2A 서버, 서비스, UI 구조를 파악하세요.
