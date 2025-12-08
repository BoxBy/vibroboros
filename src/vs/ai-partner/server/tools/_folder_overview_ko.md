# 폴더: src/vs/ai-partner/server/tools

## 역할
이 디렉터리는 AI 파트너가 로컬 개발 환경(파일 시스템, 터미널, git, 웹, 보안 스캐너 등)에 **통제된 방식으로 접근**할 수 있도록 하는 Model Context Protocol (MCP) 도구 구현을 포함합니다.

## 도구 개요 (예시)
- **파일 관련 도구**
  - `FileReadTool.ts`, `FileWriteTool.ts`, `FileAppendTool.ts`, `FileDeleteTool.ts` – 워크스페이스 범위 내에서 안전하게 파일을 읽고/쓰기/이어쓰기/삭제하는 도구입니다.
  - `MkdirTool.ts`, `MoveTool.ts`, `CopyTool.ts`, `ListDirTool.ts`, `StatTool.ts` – 디렉터리 생성, 파일 이동/복사, 디렉터리 목록 조회, 파일 메타데이터 확인을 위한 유틸리티 도구입니다.

- **실행 & 자동화**
  - `TerminalExecutionTool.ts` – 테스트/빌드 등 셸 명령을 통제된 방식으로 실행합니다.
  - `GitAutomationTool.ts` – Git 명령을 준비하고, 필요한 경우 사용자 확인을 거쳐 실행합니다.

- **분석 & 품질**
  - `SecurityVulnerabilityTool.ts` – 코드에 대한 정적 분석/보안 검사를 수행합니다.
  - `LintTool.ts` – 워크스페이스 또는 특정 파일에 대해 린터를 실행합니다.

- **지식 & 유틸리티**
  - `WebSearchTool.ts` – 외부 접근이 허용된 경우 웹 검색을 수행합니다.
  - `MemoryTool.ts` – `.agent/memory.json` 등지에 구조화된 사실/선호 정보를 저장/조회합니다.
  - `GitignoreTool.ts` – 프로젝트 유형에 따른 `.gitignore` 파일을 생성합니다.
  - `BrowserOpenTool.ts` – 필요한 경우 사용자의 기본 브라우저에서 URL을 엽니다.
  - `TaskCompletionTool.ts` – 다단계 작업이 완전히 완료되었음을 표시하는 데 사용하는 특수 도구입니다.

## AI 분석 가이드
- Orchestrator와 에이전트가 환경에서 어떤 작업을 수행할 수 있는지 이해하려면 이 폴더의 도구 정의를 훑어보세요.
- 각 도구는 Zod 기반 입력/출력 스키마와 `MCPServer.ts`에서 사용되는 `handler`를 제공합니다.
- 새로운 기능(예: 외부 시스템과의 연동)이 필요할 경우, 여기에 도구를 추가하고 `MCPServer.ts`에 등록하면 됩니다.
