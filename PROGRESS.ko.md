# 진행 상황

**상태: 진행 중 (In Progress)**

이 문서는 `PLAN.md`에 정의된 아키텍처를 기준으로 현재 Viper 프로젝트의 구현 상태를 요약합니다. 코어 아키텍처는 일상적인 사용이 가능한 수준으로 구현되었지만, 고급 컨텍스트 관리, 테스트, 문서화 등은 아직 진행 중입니다.

## 완료된 핵심 기능

- **[완료] 코어 아키텍처**
  - 중앙 `OrchestratorAgent` 구현.
  - 내부 A2A 디스패치 시스템과 Model Context Protocol (MCP) 도구 서버 통합.
  - 설정, 인증, 로깅, LLM 통신을 위한 핵심 서비스 연결.

- **[완료] 전문 에이전트**
  - `CodeAnalysis`, `ContextManagement`, `RefactoringSuggestion`, `DocumentationGeneration`, `SecurityAnalysis`, `CodeWatcher`, `AILedLearning`, `ContextArchive` 등 주요 에이전트 구현 및 통합.

- **[완료] 지능형 컨텍스트 관리 (부분 구현)**
  - `LLMService`의 `LlmMessage` 타입에 `pruningState` 필드를 추가하여 향후 가지치기/요약 파이프라인을 위한 기반을 마련했습니다.
  - 장기 기억을 위한 `ContextArchiveAgent` 기본 구조를 구현했습니다.

- **[완료] 인터랙티브 UI 기능**
  - 원클릭 리팩터링 및 문서 생성 액션을 지원합니다.
  - 채팅 세션 생성/선택/삭제가 가능한 사이드바 UI를 제공합니다.

- **[완료] 프로액티브/백그라운드 작업**
  - `CodeWatcherAgent`가 파일 저장 시 보안 검사와 재인덱싱을 트리거합니다.
  - `SecurityAnalysisAgent`가 VS Code "Problems" 패널에 결과를 보고합니다.

## 남은 작업 (요약)

- 지능형 컨텍스트 가지치기 및 대화 요약 파이프라인 완성.
- 서비스/도구/Orchestrator/UI에 대한 포괄적인 단위 및 통합 테스트 작성.
- 최신 아키텍처를 반영하도록 `PLAN.md`, `PROGRESS.md`, `TASK.md`, `docs/*.md`, `_folder_overview*.md` 문서를 지속적으로 정비.
