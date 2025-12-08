# 폴더: src/vs/ai-partner/agents

## 역할
이 디렉터리는 AI 파트너의 핵심 동작을 구현하는 전문화된 AI 에이전트들을 포함합니다. 각 `*Agent.ts` 파일은 `@a2a-js/sdk/server`의 `AgentExecutor` 인터페이스를 구현하며, 로컬 HTTP A2A 서버에 의해 호스팅됩니다.

## 에이전트 그룹
- **코어 오케스트레이션**
  - `OrchestratorAgent.ts` – 채팅 세션을 소유하고 플랜을 생성·실행하며, Model Context Protocol (MCP) 도구를 호출하고 A2A를 통해 전문 에이전트에게 단계를 위임하는 중앙 두뇌입니다.

- **코드 이해 및 수정**
  - `CodeAnalysisAgent.ts` – 코드를 인덱싱/분석하여 심볼 및 구조 정보를 제공합니다.
  - `RefactoringSuggestionAgent.ts` – 가독성, 구조, 성능 향상을 위한 리팩토링을 제안합니다.
  - `CodeEditAgent.ts` – 파일 생성/수정, diff 적용, 문서화 주석 추가 등을 담당하는 통합 코드 편집 에이전트로, 원래 동작을 최대한 보존하도록 설계되어 있습니다.
  - `TestGenerationAgent.ts` – 코드 변경에 대해 단위/통합 테스트를 제안하거나 생성합니다.

- **문서 및 프로젝트 산출물**
  - `DocumentationGenerationAgent.ts` – 코드에 대한 기술 문서를 생성합니다.
  - `ReadmeGenerationAgent.ts` – 프로젝트 컨텍스트를 기반으로 `README.md`를 생성/갱신합니다.
  - `GitignoreGenerationAgent.ts` – 프로젝트 구조에 맞는 `.gitignore` 파일을 생성합니다.

- **컨텍스트, 메모리 및 학습**
  - `ContextManagementAgent.ts` – 열린 파일, 선택 영역, 진단, 검색 결과 등을 수집/필터링하여 LLM에 전달할 컨텍스트를 구성합니다.
  - `ContextArchiveAgent.ts` – 활성 채팅 히스토리 밖의 장기 컨텍스트를 보관/검색하도록 설계된 에이전트입니다.
  - `AILedLearningAgent.ts` – 사용자의 피드백과 선호도를 기록하여 향후 제안에 반영합니다.
  - `ProgressTrackingAgent.ts` – 프로젝트/작업 진행 상황을 추적하고 플래닝 문서를 갱신합니다.
  - `BrainstormAgent.ts`, `TaskDecompositionAgent.ts` – 모호한 목표를 구조화된 작업/플랜으로 분해하는 데 도움을 줍니다.

- **백그라운드 & 안전성**
  - `CodeWatcherAgent.ts` – 파일 저장 이벤트를 감시하고 백그라운드 인덱싱 또는 보안 검사를 트리거합니다.
  - `SecurityAnalysisAgent.ts` – 보안 분석을 수행하고, 필요한 경우 VS Code Problems 패널에 결과를 노출할 수 있습니다.

## AI 분석 가이드
- 플랜 생성, A2A/Model Context Protocol (MCP) 사용, correlation 기반 idempotency를 이해하려면 먼저 `OrchestratorAgent.ts`를 읽으세요.
- 특정 기능(예: 리팩토링 제안)을 이해하거나 확장하고 싶다면 해당 에이전트 파일(예: `RefactoringSuggestionAgent.ts`)을 직접 살펴보세요.
- 이 에이전트들이 A2A 서버에 어떻게 연결되는지는 `a2a_server.ts`에서 확인할 수 있습니다.
