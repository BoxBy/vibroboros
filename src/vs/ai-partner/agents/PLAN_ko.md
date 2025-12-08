# 계획: agents

## 목표
Orchestrator가 로컬 HTTP A2A 서버를 통해 위임하는 전문 에이전트들을 구현하고 유지 관리합니다.

## 범위
- 문맥 이해를 돕기 위한 `OrchestratorAgent.ts`
- `CodeAnalysisAgent`, `RefactoringSuggestionAgent`, `DocumentationGenerationAgent`, `ReadmeGenerationAgent`, `SecurityAnalysisAgent`, `CodeWatcherAgent`, `TaskDecompositionAgent`, `BrainstormAgent`, `ProgressTrackingAgent`, `ContextArchiveAgent`, `AILedLearningAgent`, `GitignoreGenerationAgent`, `CodeEditAgent`, `TestGenerationAgent` 등 전문 에이전트들.

## 단계
1. **에이전트 배선 및 계약 정리**
   - 모든 에이전트가 `AgentExecutor`를 구현하고 `a2a_server.ts`, `A2AMessage`와 올바르게 연동되도록 합니다.
2. **동작 및 UX 검증**
   - 각 에이전트의 동작이 `PLAN.md` 설계와 일치하며, 유용하고 설명 가능한 결과를 내는지 검증합니다.
3. **에러 처리 및 로깅 강화**
   - 모든 에이전트에 대해 견고한 예외 처리와 개발자 로그를 추가합니다.
4. **반복 및 개선**
   - 실제 사용 피드백을 기반으로 프롬프트와 워크플로우를 지속적으로 개선합니다.
