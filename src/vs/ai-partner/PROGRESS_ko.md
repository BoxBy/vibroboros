# 진행 상황: src/vs/ai-partner

## 상태
진행 중 – 핵심 배선은 구현되어 있으며, 고급 컨텍스트 관리/장기 메모리/테스트는 부분적으로만 구현된 상태입니다.

## 완료된 작업
- AI 파트너 `extension.ts`가 서비스를 초기화하고 Model Context Protocol (MCP) 서버인 `MCPServer.ts`와 A2A 서버를 시작한 뒤 `OrchestratorAgent`를 생성합니다.
- `AIPartnerViewProvider`가 React UI와 Orchestrator를 연결합니다.
- `a2a_server.ts`가 전문 에이전트를 호스팅하고 `message.parts` 및 A2A 데이터 페이로드를 정규화합니다.

## 진행 중인 작업
- `OrchestratorAgent`의 correlation 기반 idempotency와 동적 post-action 로직이 구현되어 있으나 계속 개선 중입니다.
- 컨텍스트 관리 및 아카이브/검색 흐름이 스캐폴드 수준으로만 존재하며, 실제 워크플로우에 완전히 연결되지는 않았습니다.

## 다음 단계
- Model Context Protocol (MCP)/A2A 시작 및 디스패치 주변의 오류 처리를 강화합니다.
- 지능형 컨텍스트 프루닝과 `ContextArchiveAgent`를 실제 채팅 흐름에 통합합니다.
- 엔드 투 엔드 시나리오를 대상으로 하는 현실적인 단위/통합 테스트를 추가합니다.
