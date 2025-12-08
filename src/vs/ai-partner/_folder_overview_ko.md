# 폴더: src/vs/ai-partner

## 역할
이 디렉터리는 "AI 파트너" 서브시스템의 핵심 코드를 포함합니다. Orchestrator 에이전트, 프로세스 내 Model Context Protocol (MCP) 도구 서버, 로컬 HTTP A2A 서버, 공용 서비스, React 기반 웹뷰 UI를 하나로 연결하는 곳입니다.

## 구조 개요
- **`extension.ts`** – `src/extension.ts`에서 호출되는 AI 파트너 진입점입니다. 서비스들을 초기화하고, MCP 서버를 시작하고, A2A 서버를 구동한 뒤 `OrchestratorAgent`와 메인 웹뷰 공급자를 생성합니다.
- **`AIPartnerViewProvider.ts`** – VS Code 사이드바 웹뷰를 관리하고, UI에서 온 메시지를 Orchestrator로 전달하며, Orchestrator의 응답(채팅, 플랜, diff, 상태 업데이트)을 다시 UI로 보냅니다.
- **`a2a_server.ts`** – Express 기반 HTTP A2A 서버입니다. CodeAnalysis, RefactoringSuggestion, DocumentationGeneration, SecurityAnalysis, CodeWatcher, ContextArchive, CodeEdit 등 전문 에이전트를 호스팅합니다. `message.parts`를 정규화하고 A2A 데이터 페이로드에 `filePath`와 correlation 정보를 주입합니다.
- **`server/`** – `MCPServer.ts`와 `server/tools/` 아래 Model Context Protocol (MCP) 도구들을 포함합니다. 파일 I/O, 터미널, git, 웹 검색, 보안 스캔, 메모리, 린트, 브라우저 열기 등 기능을 제공합니다.
- **`services/`** – `LLMService`, `DeveloperLogService`, `ConfigService`, `AuthService` 및 스트리밍/터미널 보조 서비스와 같이 여러 부분에서 재사용되는 공용 서비스들이 위치합니다.
- **`agents/`** – 중앙 두뇌인 `OrchestratorAgent.ts`와, A2A 서버에 의해 호스팅되는 여러 전문 에이전트가 위치합니다.
- **`interfaces/`** – `A2AMessage` 및 코드 데이터 구조와 같은 핵심 데이터 계약(인터페이스)을 정의합니다.
- **`ui/`** – 채팅, 플랜 뷰, diff 뷰, 상태 메시지를 렌더링하는 React/Vite 기반 웹뷰 UI 코드입니다.
- **`testing/`** – AI 파트너 서브시스템 전용 테스트(현재는 스캐폴딩 수준)가 위치합니다.

## AI 분석 가이드
- Model Context Protocol (MCP), A2A, 서비스, Orchestrator가 어떻게 연결되는지 보려면 이 폴더의 `extension.ts`부터 읽으세요.
- 플랜 생성, correlation 기반 idempotency, A2A/MCP 사용 방식을 이해하려면 `agents/OrchestratorAgent.ts`를 확인하세요.
- 도구와 로컬 환경 접근 기능을 이해하려면 `server/MCPServer.ts`와 `server/tools/` 아래 파일들을 살펴보세요.
- UI 동작은 `ui/MainView.tsx`와 `ui/services/vscode.ts`에서 시작해 추적할 수 있습니다.
