# PLAN.ko: Viper 프로젝트 블루프린트

## 1. 프로젝트 개요

Viper는 VS Code에 깊이 통합된 다중 에이전트(Multi‑Agent) AI 코딩 파트너입니다. 중앙 Orchestrator 에이전트, 로컬 HTTP A2A(Agent‑to‑Agent) 서버, 프로세스 내 MCP(Model Context Protocol) 도구 서버, 현대적인 React 기반 UI를 중심으로 설계되었습니다.

이 문서는 **현재 코드 기준 아키텍처**와, **설계되어 있으나 일부만 구현된 지능형 컨텍스트 관리/ContextArchiveAgent 기능**을 한국어로 정리합니다.

## 2. 핵심 아키텍처 모델

### 2.1 확장 진입점 (`src/vs/ai-partner/extension.ts`)

VS Code 확장 진입점은 다음 구성요소를 초기화하고 연결합니다.

- **서비스 초기화**
  - `ConfigService`, `AuthService`, `LLMService`, `DeveloperLogService`를 초기화합니다.
  - 문제 보고를 위해 `vscode.DiagnosticCollection`을 생성합니다.

- **프로세스 내 MCP 서버**
  - `createMCPServer()` (`server/MCPServer.ts`)를 호출해 `FileReadTool`, `FileWriteTool`, `TerminalExecutionTool`, `GitAutomationTool`, `WebSearchTool`, `MemoryTool`, `SecurityVulnerabilityTool`, `TaskCompletionTool` 등의 도구를 등록합니다.
  - MCP SDK의 in‑memory transport (`@modelcontextprotocol/sdk/inMemory`)를 우선 사용하고, 사용 불가 시 `mcp_in_process_duplex.ts` 기반 듀플렉스를 사용합니다.
  - `@modelcontextprotocol/sdk/client`의 `Client` 인스턴스를 생성해 서버 트랜스포트에 연결합니다.

- **MCP 클라이언트 라우터**
  - 기본 MCP 클라이언트를 감싸서 다음을 지원합니다.
    - 우선 프로세스 내 MCP 서버의 도구를 호출.
    - `.agent/mcp-servers.json`에 정의된 외부 MCP 서버로의 라우팅(표준입력/표준출력 기반 `StdioClientTransport`).
  - 최종적으로 단일 `mcpClient`를 `setMcpClient`를 통해 노출하며, 에이전트들은 이 클라이언트를 통해 도구를 호출합니다.

- **로컬 HTTP A2A 서버**
  - 설정된 포트에서 `agentBaseUrl`을 계산합니다.
  - `A2AClient.fromCardUrl`( `@a2a-js/sdk/client` )을 사용해 A2A 메시지를 보내는 `dispatch` 함수를 생성합니다.
  - `startA2AServer`를 호출해 Express 기반 A2A 서버를 시작하고, MCP 서버/서비스/diagnostics/로그 서비스/워크스페이스 상태를 주입합니다.
  - 서버 시작 완료까지 `dispatch`가 기다리도록 readiness barrier를 둡니다.

- **Orchestrator 및 UI 연결**
  - `OrchestratorAgent`를 생성하면서 `dispatch`, MCP 서버, 서비스, `workspaceState`, diagnostics, 로그 서비스를 주입합니다.
  - `AIPartnerViewProvider`를 등록하고, 웹뷰에서 수신한 메시지를 `OrchestratorAgent.handleUIMessage`로 전달합니다.

### 2.2 MCP 도구 서버 (`src/vs/ai-partner/server`)

- `MCPServer.ts`는 MCP SDK의 `Server`를 사용해 로컬 도구 집합을 노출합니다.
- 도구 구현은 `server/tools/` 디렉터리에 위치하며, SDK 표준 `callTool({ name, arguments })` 형태의 요청/응답 계약을 따릅니다.
- Orchestrator 및 다른 에이전트는 (제어된 일부 예외를 제외하고) 파일 시스템/터미널에 직접 접근하지 않고 **항상 MCP 도구를 통해서만** 로컬 환경과 상호작용합니다.

### 2.3 로컬 HTTP A2A 서버 (`src/vs/ai-partner/a2a_server.ts`)

- Express 기반 서버이며, `@a2a-js/sdk/server`의 `AgentExecutor` 인터페이스를 구현하는 **전문 에이전트들**을 호스팅합니다.
- `.agent/a2a-servers.json`에서 에이전트 설정을 읽고, `DEFAULT_AGENT_CONFIGS`와 병합해 `CodeAnalysisAgent`, `RefactoringSuggestionAgent`, `ReadmeGenerationAgent`, `CodeWatcherAgent`, `SecurityAnalysisAgent`, `ContextArchiveAgent` 등 핵심 에이전트가 항상 존재하도록 보장합니다.
- 각 에이전트에 대해:
  - `InMemoryTaskStore`를 생성하고, A2A SDK 요구사항에 맞게 `message.parts`를 정규화하는 래퍼 executor를 둡니다.
  - 항상 `text` 파트를 보장하고, 가능하면 `application/vnd.a2a+json` MIME 타입의 `data` 파트에 `filePath`, `correlation` 등을 포함시킵니다.
  - `/agent/{name}/card` 엔드포인트를 통해 `A2AClient.fromCardUrl`이 에이전트 카드를 조회하고 호출할 수 있도록 합니다.
- **OrchestratorAgent는 A2A 서버에 호스팅되지 않고**, 확장 프로세스 안에서 직접 인스턴스화되며, `dispatch`를 통해 A2A 서버의 전문 에이전트를 호출합니다.

### 2.4 OrchestratorAgent (`src/vs/ai-partner/agents/OrchestratorAgent.ts`)

`OrchestratorAgent`는 시스템의 중앙 "두뇌"입니다.

- VS Code `workspaceState`를 활용해 **채팅 세션 및 기록**을 관리합니다.
- 웹뷰에서 들어온 메시지를 `handleUIMessage`로 처리합니다.
- `LLMService`와 프롬프트 템플릿(`agents/prompts.ts`)을 사용해:
  - 사용자의 입력이 단순 대화인지, 복잡한 작업(계획/코드 수정 등)인지 분류합니다.
  - 최소 실행 계획을 생성합니다.
  - 각 단계를 적절한 전문 에이전트로 라우팅합니다.
- MCP 클라이언트를 사용해 파일/터미널 관련 작업을 도구 호출로 수행합니다.

#### 2.4.1 Correlation 기반 idempotency

지연된 A2A 응답이나 중복 응답으로 인해 계획이 두 번 진행되는 문제를 막기 위해, Orchestrator는 `docs/design-correlation-idempotency.md`에 정의된 **correlation 기반 idempotency**를 구현합니다.

- 각 계획마다 `planId`(=workflowId), 각 단계마다 `stepId`를 생성합니다.
- 각 단계 디스패치마다 `executionId`(=runId)를 생성합니다.
- A2A 메시지(`request-code-edit`, `request-brainstorm`, `request-refactoring-suggestion` 등)를 보낼 때:
  - `task.data`와 `application/vnd.a2a+json` `data` 파트에 `correlation` 객체를 포함합니다.
- `response-code-execution` 등의 응답을 받을 때:
  - 수신된 `planId/workflowId`, `stepId`, `executionId/runId`가 현재 진행 중인 단계의 값과 모두 일치하는지 검증합니다.
  - 내부 `handledExecutions` 집합을 사용해 중복 응답을 무시합니다.

#### 2.4.2 계획 및 사후 작업(post-actions) 수명주기

- 사용자 요청과 에이전트 설명을 기반으로 최소 실행 계획을 생성합니다.
- 각 단계의 상태(`pending`, `in-progress`, `completed`)를 추적합니다.
- 코드 변경이 필요한 단계는 UI에 diff를 띄우고, 사용자가 수락할 때까지 진행을 멈춥니다.
- 계획이 완료되면 생성된 아티팩트를 바탕으로 문서/테스트 생성 등의 **후속 작업 후보**를 만들고, 사용자가 어떤 항목을 실행할지 선택하게 합니다.

### 2.5 전문 에이전트 (`src/vs/ai-partner/agents/*.ts`)

전문 에이전트는 모두 A2A 서버에 호스팅되는 `AgentExecutor` 구현입니다.

- `CodeAnalysisAgent`: 코드 인덱싱/분석 및 심볼 검색을 담당하며, 필요 시 `LLMService`를 사용해 고급 분석을 수행합니다.
- `RefactoringSuggestionAgent`: 리팩터링 제안을 생성합니다.
- `DocumentationGenerationAgent`, `ReadmeGenerationAgent`: 코드/프로젝트 문서를 생성합니다.
- `SecurityAnalysisAgent`: 보안 점검을 수행합니다.
- `CodeWatcherAgent`: 파일 저장 이벤트를 감시하고, 인덱싱/보안 검사를 트리거합니다.
- `TaskDecompositionAgent`, `BrainstormAgent`, `ProgressTrackingAgent`, `ContextArchiveAgent`, `GitignoreGenerationAgent` 등.

에이전트 간 상호작용은 모두 A2A 프로토콜을 통해 이루어지며, 직접 내부 구현에 의존하지 않습니다.

## 3. 사용자 인터페이스 (`src/vs/ai-partner/ui`)

- React + Vite 기반 웹뷰 UI입니다.
- `MainView.tsx`가 채팅/계획/보조 패널을 통합 관리합니다.
- `services/vscode.ts`는 `acquireVsCodeApi()`를 감싼 브리지로, 웹뷰와 확장 호스트 간 메시지를 타입 안정적으로 주고받도록 도와줍니다.
- UI는 다음을 렌더링합니다.
  - 사용자/에이전트 채팅 메시지.
  - 실행 계획과 단계별 상태.
  - diff 및 명령 확인 뷰.
  - 세션 생성/선택/삭제 UI.

## 4. 지능형 컨텍스트 관리 (설계)

코어 아키텍처 외에, Viper는 **지능형 컨텍스트 관리**와 **장기 기억**을 지원하도록 설계되어 있습니다. 일부는 코드에 반영되어 있고, 나머지는 향후 구현 대상입니다.

### 4.1 LLM 대화 기록 가지치기(pruning)

- `LLMService`의 `LlmMessage` 타입에는 선택적 필드 `pruningState?: 'pending' | 'keep' | 'prune'`가 정의되어 있습니다.
- 최종 목표는 다음과 같습니다.
  - 시스템 프롬프트에서 코드 블록/로그/파일 덤프와 같은 큰 콘텐츠를 `<prunable>...</prunable>` 태그로 감싸도록 LLM에 지시합니다.
  - 해당 콘텐츠가 포함된 어시스턴트 메시지를 `pruningState: 'pending'` 상태로 저장합니다.
  - 새 사용자 메시지가 들어올 때, 직전 메시지들이 여전히 관련 있는지 판단해 `pruningState`를 `'keep'` 또는 `'prune'`으로 변경합니다.
  - `'prune'` 메시지의 본문은 `[간결함을 위해 내용 가지치기됨]` 같은 플레이스홀더로 대체하고, 이를 기반으로 LLM 컨텍스트를 구성합니다.

**현재 상태:**

- 타입 수준 기반( `pruningState` 필드)은 구현되어 있습니다.
- `<prunable>` 태그 처리, `getPrunedHistory`/`getPrunedAndSummarizedHistory` 같은 전체 파이프라인은 아직 구현되지 않았으며, 향후 작업으로 남아 있습니다.

### 4.2 대화 요약(summarization)

계획된 동작(부분 구현):

- 대화 길이가 임계값을 넘으면, 오래된 절반을 요약해 하나의 시스템 메시지로 압축합니다.
- 요약 메시지 + 최신 메시지들을 조합해 다음 LLM 호출 컨텍스트를 구성합니다.
- 현재는 Orchestrator가 **세션 제목 요약** 등 일부 경량 요약만 수행하고 있으며, 전체 대화 수준 요약 파이프라인은 미완성 상태입니다.

### 4.3 ContextArchiveAgent와 장기 기억

`ContextArchiveAgent`는 활성 대화 기록을 넘어서는 **장기 기억 저장소**를 제공하도록 설계되었습니다.

- **보관(archive)**
  - `archiveContext` 메시지 유형을 처리해 코드/비코드 콘텐츠를 수신합니다.
  - 콘텐츠가 코드인지 여부(예: 마크다운 코드 펜스 등)를 판별해 codeArchive / nonCodeArchive에 저장하고, 필요 시 `vscode.Memento`를 사용해 영속화합니다.

- **검색(search)**
  - `searchArchivedContext` 메시지 유형을 처리해 쿼리 문자열을 기반으로 검색합니다.
  - 우선 비코드 아카이브를 검색하고, 필요 시 코드 아카이브까지 확장합니다.
  - 가장 관련성 높은 결과를 요약해 `response-archived-context` 메시지로 Orchestrator에 반환합니다.

- **Orchestrator 연동(설계)**
  - 대화 기록을 가지치기/요약하면서 버리는 콘텐츠를 `ContextArchiveAgent`에 `archiveContext`로 넘깁니다.
  - LLM/Orchestrator가 정보 부족을 감지하면 `searchArchivedContext`를 호출해 아카이브에서 컨텍스트를 가져오고, `llmConversationHistory` 앞부분에 시스템 메시지 형태로 삽입한 뒤 재시도합니다.

에이전트 클래스와 기본 호스팅 구조는 이미 존재하지만, 전체 아카이브/검색 워크플로와 Orchestrator 연동은 아직 완전히 구현되지 않았습니다.

## 5. 상위 수준 디렉터리 구조

관련 부분의 상위 수준 구조는 다음과 같습니다.

```text
src/
  extension.ts                # 루트 확장 진입점
  vs/
    ai-partner/
      extension.ts            # AI 파트너 서브시스템 진입점
      AIPartnerViewProvider.ts# 웹뷰 공급자
      a2a_server.ts           # 전문 에이전트를 호스트하는 로컬 HTTP A2A 서버
      server/                 # MCP 서버 및 도구
      services/               # LLMService, DeveloperLogService, ConfigService, AuthService
      agents/                 # OrchestratorAgent + 전문 에이전트들
      interfaces/             # A2A 및 코드 데이터 인터페이스
      ui/                     # React 웹뷰 UI
```

이 PLAN.ko와 `PLAN.md`, `docs/architecture.md`, `docs/design-correlation-idempotency.md`는 현재 아키텍처에 대한 **진실의 단일 소스**로 간주해야 합니다. 코드가 변경되면 이 문서들도 함께 업데이트해야 합니다.
