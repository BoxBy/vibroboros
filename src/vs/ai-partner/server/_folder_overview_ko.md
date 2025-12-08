# 폴더: src/vs/ai-partner/server

## 역할
이 디렉터리는 Orchestrator 및 다른 에이전트에 도구를 제공하는 프로세스 내 MCP(Model Context Protocol) 서버와 관련 스키마를 포함합니다.

## 파일 개요
- `MCPServer.ts` – `@modelcontextprotocol/sdk/server`의 `Server` 인스턴스를 생성하고, 모든 도구를 등록하여 MCP tools 기능으로 노출합니다.
- `schemas/` (존재하는 경우) – 서버가 도구 목록/호출 요청을 처리할 때 사용하는 요청/응답 스키마(`ToolsListRequestSchema`, `ToolsCallRequestSchema` 등)를 정의합니다.
- `tools/` – 개별 도구 구현이 위치하는 하위 디렉터리입니다(자세한 설명은 해당 폴더의 `_folder_overview.md` 참고).

## AI 분석 가이드
- 도구가 어떻게 등록되고 `listTools`/`callTool` 요청을 어떻게 처리하는지 이해하려면 먼저 `MCPServer.ts`를 읽으세요.
- 에이전트가 어떤 기능(파일 I/O, 터미널, git, 웹 검색, 보안 등)을 사용할 수 있는지 알고 싶다면 `tools/` 하위 디렉터리의 구현을 살펴보세요.
- MCP 클라이언트 연결 및 라우팅 로직은 `src/vs/ai-partner/extension.ts`에 있으니, 이 서버가 시스템 전체와 어떻게 연결되는지 이해하려면 해당 파일을 함께 보세요.
