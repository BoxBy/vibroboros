# 계획: src/vs/ai-partner

## 목표
VS Code 활성화를 Orchestrator, Model Context Protocol (MCP) 도구 서버, A2A 서버, 공용 서비스, React UI에 연결하는 AI 파트너 서브시스템을 안정화하고 발전시키는 것입니다.

## 범위
- `extension.ts` (AI 파트너 진입점)
- `AIPartnerViewProvider.ts` (웹뷰 브리지)
- `a2a_server.ts` (로컬 HTTP A2A 서버)
- `server/`, `services/`, `agents/`, `interfaces/`, `ui/`, `testing/`

## 단계
1. **기반 및 배선 정리**
   - extension → AI Partner → Model Context Protocol (MCP) → A2A 배선을 단순하고 견고하게 유지합니다.
   - Orchestrator가 사용자 요청의 유일한 진입점이 되도록 보장합니다.
2. **컨텍스트 관리 및 메모리**
   - correlation 기반 idempotency와 지능형 컨텍스트 관리를 완성합니다.
   - 장기 메모리를 위해 `ContextArchiveAgent`를 통합합니다.
3. **UI & UX**
   - 웹뷰에서 플랜, diff, 상태 업데이트, 스트리밍 응답을 명확하게 제공합니다.
4. **테스트 및 하드닝**
   - 핵심 흐름을 검증하는 단위/통합 테스트를 `testing/` 및 `src/test` 아래에 추가합니다.
