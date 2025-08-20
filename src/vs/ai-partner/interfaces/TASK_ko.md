# 작업: 기초 설계 (/interfaces)

## 목표
- 두 개의 고유한 통신 프로토콜(내부 A2A 및 외부 MCP)에 대한 상세 데이터 스키마와 인터페이스를 설계하고 정의합니다.

## 하위 작업
- [ ] `src/vs/ai-partner/interfaces/A2AMessage.ts` 파일을 생성하고 표준 **A2A 메시지 형식** 인터페이스를 정의합니다.
- [ ] `src/vs/ai-partner/interfaces/CodeData.ts` 파일을 생성하고 `CodeSummary` 및 `CallGraph` 데이터 구조 인터페이스를 정의합니다.
- [ ] `src/vs/ai-partner/interfaces/MCPMessage.ts` 파일을 생성하고 클라이언트-서버 통신을 위한 **MCP 메시지 형식**을 정의합니다.