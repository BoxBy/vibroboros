# PLAN.md: Vibroboros Project Blueprint

## 1. Project Overview

Vibroboros는 VS Code에 통합된 정교한 다중 에이전트(Multi-Agent System, MAS) AI 코딩 파트너입니다. 이 시스템은 분산된 전문 에이전트들의 협력을 통해 개발자의 생산성을 높이고, 코드 품질을 개선하며, 개발 수명주기를 간소화하는 것을 목표로 합니다. 각 에이전트는 특정 작업(예: 코드 분석, 리팩토링, 문서 생성)을 전문적으로 수행하며, 중앙 오케스트레이터 에이전트에 의해 조율됩니다.

## 2. Core Architectural Principles

### 2.1. Multi-Agent System (MAS)
- **논리적 분산, 물리적 중앙화**: 각 에이전트는 독립적인 역할을 수행하는 논리적 단위로 설계되었습니다. 하지만 실제 실행은 별도의 HTTP 서버가 아닌, VS Code 확장 프로그램의 단일 프로세스 내에서 중앙 집중식 디스패치 시스템을 통해 이루어집니다.
- **역할 기반 전문화**: 각 에이전트는 명확하게 정의된 단일 책임을 가집니다. (예: `SecurityAnalysisAgent`는 보안만 담당)

### 2.2. Communication Protocols

1.  **Agent-to-Agent (A2A) - 내부 디스패치 모델**:
    - `extension.ts`에 정의된 `dispatchA2AMessage` 함수를 통해 모든 에이전트 간 통신이 이루어집니다.
    - 에이전트는 `agentRegistry`에 등록되며, 메시지의 `recipient` 필드를 통해 특정 에이전트로 메시지가 전달됩니다.
    - 이는 표준 A2A 프로토콜의 HTTP 기반 통신을 단순화한 내부 구현입니다.

2.  **Model-Capability-Provider (MCP) - 도구 제공 프로토콜**:
    - `MCPServer`는 LLM(에이전트)이 실제 개발 환경의 기능(파일 읽기/쓰기, 터미널 실행, 웹 검색 등)을 사용할 수 있도록 "도구(Tool)"를 제공하는 로컬 서버입니다.
    - 에이전트(주로 `OrchestratorAgent`)는 LLM의 도구 사용 요청을 받아 `MCPServer`에 JSON-RPC 2.0 형식의 `MCPMessage`를 보내고, 그 결과를 다시 LLM에게 전달합니다.

3.  **UI-Backend Communication**:
    - UI(React, Webview)와 백엔드(`OrchestratorAgent`)는 VS Code의 `Webview.postMessage()` API를 통해 비동기 메시지를 주고받습니다.
    - UI는 `vscodeService`를 통해 백엔드로 커맨드를 보내고, 백엔드는 `window.addEventListener('message', ...)`를 통해 UI로부터 메시지를 수신하여 처리합니다.

### 2.3. State Management
- **영속성**: VS Code의 `Memento` API (`workspaceState`)를 사용하여 채팅 세션, 대화 기록, 에이전트 학습 데이터, 코드 인덱스 등 중요한 상태를 디스크에 영속적으로 저장합니다. 이를 통해 VS Code를 재시작해도 데이터가 유지됩니다.

## 3. Project File Structure

```
/src/vs/ai-partner/
├── extension.ts                # 확장 프로그램 진입점, 에이전트 및 서비스 초기화
├── AIPartnerViewProvider.ts    # VS Code 사이드바 웹뷰 관리
│
├── services/
│   ├── LLMService.ts           # LLM API 통신 담당
│   ├── ConfigService.ts        # VS Code 설정 관리
│   ├── AuthService.ts          # 인증(Google/API Key) 관리
│   └── DeveloperLogService.ts  # 개발자용 로그 채널 관리
│
├── agents/
│   ├── OrchestratorAgent.ts    # 중앙 조정 에이전트, 모든 것의 허브
│   ├── CodeAnalysisAgent.ts    # 코드베이스 인덱싱 및 검색
│   ├── ContextManagementAgent.ts # LLM 컨텍스트 수집 및 구성
│   ├── RefactoringSuggestionAgent.ts # 리팩토링 제안 생성
│   ├── DocumentationGenerationAgent.ts # 문서 생성
│   ├── AILedLearningAgent.ts   # 사용자 피드백 학습
│   ├── CodeWatcherAgent.ts     # 파일 변경 감지 및 자동 분석 트리거
│   ├── SecurityAnalysisAgent.ts# 보안 취약점 분석
│   └── ContextArchiveAgent.ts  # 장기 기억(컨텍스트 아카이브) 관리
│
├── server/
│   ├── MCPServer.ts            # MCP 도구 서버
│   └── tools/                  # MCPServer가 제공하는 도구 구현
│       ├── FileReadTool.ts
│       ├── FileWriteTool.ts
│       └── ...
│
├── interfaces/
│   ├── A2AMessage.ts           # A2A 통신 메시지 인터페이스
│   └── MCPMessage.ts           # MCP 통신 메시지 인터페이스
│
├── core_data_structures.ts     # 핵심 데이터 구조 (사용 중단, LlmMessage 등으로 대체)
│
└── ui/
    ├── index.tsx               # React UI 진입점
    ├── MainView.tsx            # 최상위 UI 컴포넌트, 상태 관리
    ├── components/             # (가상) Header, MessageList 등 하위 컴포넌트
    └── services/
        └── vscode.ts           # postMessage API 래퍼
```

## 4. Detailed Component Breakdown

### Part 1: Extension Entrypoint (`extension.ts`)
- **`activate(context)`**:
    1.  **서비스 초기화**: `ConfigService`, `DeveloperLogService`, `AuthService`, `MCPServer`, `LLMService` 등 핵심 서비스를 싱글톤 패턴으로 인스턴스화합니다.
    2.  **에이전트 등록**: 모든 에이전트를 인스턴스화하고 `agentRegistry` (Map)에 등록합니다. 이때 각 에이전트에게 필요한 의존성(서비스, 디스패치 함수 등)을 주입합니다.
    3.  **백그라운드 에이전트 활성화**: `CodeWatcherAgent.activate()`를 호출하여 파일 감시를 시작합니다.
    4.  **UI(웹뷰) 등록**: `AIPartnerViewProvider`를 VS Code 윈도우에 등록하여 사이드바 UI를 렌더링하고, `OrchestratorAgent`를 주입하여 UI와 백엔드를 연결합니다.
    5.  **초기 인덱싱 트리거**: `CodeAnalysisAgent`에게 `request-initial-index` 메시지를 보내 코드베이스 인덱싱을 시작하도록 요청합니다.
- **`dispatchA2AMessage(message)`**:
    - `agentRegistry`에서 `message.recipient`에 해당하는 에이전트를 찾아 `handleA2AMessage` 메소드를 호출합니다.

### Part 2: Core Services

- **`ConfigService`**: VS Code 설정(`vibroboros.*`)을 읽고 쓰는 싱글톤 서비스. 인증 모드, API 키, 엔드포인트, 에이전트별 모델 설정 등을 관리.
- **`DeveloperLogService`**: 'AI Partner (Developer)'라는 별도의 출력 채널에 디버그 로그를 기록하는 싱글톤 서비스.
- **`AuthService`**: `ConfigService`의 인증 모드에 따라 Google 인증(VS Code 내장 API 사용) 또는 API Key 인증을 처리하는 싱글톤 서비스.
- **`LLMService`**: `fetch` API를 사용하여 OpenAI 호환 LLM API와 통신. 인증 정보, 요청 본문, 오류 처리 등을 담당. `LlmMessage` 타입을 정의.

### Part 3: Core Communication & Data Structures

- **`MCPServer`**: `extension.ts`에서 단일 인스턴스로 생성. `FileReadTool`, `FileWriteTool`, `TerminalExecutionTool` 등 다양한 도구를 `tools` 맵에 등록. `getToolSchemas()`로 LLM에게 도구 명세를 제공하고, `handleRequest()`로 도구 실행 요청을 처리.
- **`interfaces/A2AMessage.ts`**: 에이전트 간 통신에 사용되는 메시지 구조. `{ sender, recipient, type, payload, timestamp }` 필드를 가짐.
- **`interfaces/MCPMessage.ts`**: `MCPServer` 통신에 사용되는 표준 JSON-RPC 2.0 메시지 구조. `{ jsonrpc, id, method, params }` 필드를 가짐.

### Part 4: The Agents (Detailed)

#### `OrchestratorAgent`
- **Purpose**: 시스템의 두뇌. UI 이벤트 처리, 대화 흐름 관리, 다른 에이전트 조율, LLM 통신, 상태/세션 관리를 총괄.
- **State**: `vscode.Memento`를 사용하여 채팅 세션 목록, 활성 세션 ID, 세션별 대화 기록(`chatHistory`, `llmConversationHistory`)을 영속적으로 관리.
- **A2A Handling**:
    - **Receives**: `response-context` (`ContextManagementAgent`), `response-refactoring-suggestions` (`RefactoringSuggestionAgent`), `response-documentation-generation`, `response-security-analysis`, `response-archived-context`.
    - **Dispatches**: `request-context`, `request-refactoring-suggestions`, `request-documentation-generation`, `archiveContext`, `searchArchivedContext`.
- **Key Logic**:
    1.  UI로부터 `userQuery` 수신.
    2.  사용자 입력 키워드를 분석하여 전문 에이전트(`Refactoring`, `Documentation`)에게 위임할지 결정.
    3.  위임하지 않을 경우, `ContextManagementAgent`에게 컨텍스트를 요청.
    4.  컨텍스트를 받아 시스템 프롬프트를 구성하고 `LLMService`를 통해 LLM에 응답 요청.
    5.  LLM 응답이 '도구 사용'이면 `MCPServer`를 통해 도구 실행 후 결과를 다시 LLM에 전달.
    6.  LLM 응답이 '텍스트'이면 `<thought>` 태그 등을 파싱하여 최종 응답을 UI에 전달.
    7.  대화 토큰 수가 임계값을 넘으면 `summarizeHistory`를 호출하여 대화 요약.
    8.  `<prunable>` 콘텐츠를 `ContextArchiveAgent`에 보내 장기 기억.

#### `ContextManagementAgent`
- **Purpose**: `OrchestratorAgent`의 요청을 받아 LLM에게 전달할 컨텍스트를 수집.
- **A2A Handling**:
    - **Receives**: `request-context` (`OrchestratorAgent`), `response-codebase-search` (`CodeAnalysisAgent`).
    - **Dispatches**: `request-codebase-search` (`CodeAnalysisAgent`), `response-context` (`OrchestratorAgent`).
- **Key Logic**:
    1.  `request-context` 수신 시 활성 파일, 열린 파일, UI 언어 등 기본 컨텍스트 수집.
    2.  사용자 쿼리에서 심볼을 추출하여 `CodeAnalysisAgent`에 검색 요청.
    3.  검색 결과를 받아 기본 컨텍스트와 병합 후 `OrchestratorAgent`에 `response-context`로 전달.

#### `CodeAnalysisAgent`
- **Purpose**: 코드베이스의 심볼(함수, 클래스 등) 인덱스를 구축하고 검색.
- **State**: `vscode.Memento`에 `{ [filePath]: { symbols: [...] } }` 형태로 인덱스 저장.
- **A2A Handling**:
    - **Receives**: `request-initial-index`, `request-reindex-file`, `request-codebase-search`.
    - **Dispatches**: `response-codebase-search`.
- **Key Logic**: `request-codebase-search`를 받으면 `Memento`에 저장된 인덱스에서 심볼을 찾아 결과를 반환. (인덱스 구축 로직은 현재 미구현)

#### `RefactoringSuggestionAgent`
- **Purpose**: 코드 리팩토링 제안 생성.
- **A2A Handling**:
    - **Receives**: `request-refactoring-suggestions`.
    - **Dispatches**: `response-refactoring-suggestions`.
- **Key Logic**:
    1.  `MCPServer`의 `FileReadTool`로 파일 내용 읽기.
    2.  `AILedLearningAgent.getPreference()`로 사용자 선호도 확인 후 LLM 프롬프트 조정.
    3.  `LLMService`로 리팩토링된 코드 요청.
    4.  결과를 `ui-action` 객체(UI 버튼 생성용)로 포장하여 `OrchestratorAgent`에 전달.

#### `DocumentationGenerationAgent`
- **Purpose**: 코드 문서 생성.
- **A2A Handling**:
    - **Receives**: `request-documentation-generation`.
    - **Dispatches**: `response-documentation-generation`.
- **Key Logic**: `RefactoringSuggestionAgent`와 유사. 파일 읽기 -> LLM으로 문서 생성 -> `ui-action` 객체(문서 파일 저장 버튼용)로 포장하여 전달.

#### `AILedLearningAgent`
- **Purpose**: 사용자 피드백을 학습하여 개인화 제공.
- **State**: `Memento`에 `{ refactoring_accepted: 2, refactoring_dismissed: 5 }` 와 같이 피드백 횟수 저장.
- **A2A Handling**:
    - **Receives**: `log-user-feedback`.
- **Key Logic**: `log-user-feedback` 수신 시 `Memento`에 횟수 업데이트. `getPreference()` 호출 시 저장된 횟수를 분석하여 사용자의 선호도를 'positive', 'negative', 'neutral'로 반환.

#### `CodeWatcherAgent`
- **Purpose**: 백그라운드에서 파일 변경 감지.
- **A2A Handling**:
    - **Dispatches**: `request-security-analysis`, `request-reindex-file`.
- **Key Logic**: `vscode.workspace.onDidSaveTextDocument` 이벤트 리스너를 등록. 파일 저장 시 `SecurityAnalysisAgent`와 `CodeAnalysisAgent`에 분석 및 재인덱싱을 요청하는 메시지를 자동으로 디스패치.

#### `SecurityAnalysisAgent`
- **Purpose**: 빠른 로컬 보안 취약점 스캔.
- **A2A Handling**:
    - **Receives**: `request-security-analysis`.
    - **Dispatches**: `response-security-analysis`.
- **Key Logic**: `MCPServer`의 `SecurityVulnerabilityTool` (정규식 기반)을 호출. 취약점 발견 시에만 `OrchestratorAgent`에 보고하여 VS Code '문제' 탭에 표시하도록 함.

#### `ContextArchiveAgent`
- **Purpose**: 대화의 장기 기억 관리.
- **State**: `Memento`에 `codeArchive`와 `nonCodeArchive` 배열 저장.
- **A2A Handling**:
    - **Receives**: `archiveContext`, `searchArchivedContext`.
    - **Dispatches**: `response-archived-context`.
- **Key Logic**: `archiveContext`로 받은 내용을 코드/비코드로 분류하여 저장. `searchArchivedContext` 요청 시 아카이브를 검색하여 찾은 정보를 `OrchestratorAgent`에 전달.

### Part 5: The User Interface (React)

- **`ui/index.tsx`**: `ReactDOM.createRoot`를 사용하여 `root` 엘리먼트에 `MainView` 컴포넌트를 렌더링하는 진입점.

- **`ui/MainView.tsx`**:
    - **State**: `useState`로 `view`('chat'|'settings'), `messages` (화면 표시용), `sessions` (채팅 기록 목록), `error` 등 UI의 모든 상태를 관리.
    - **Communication**:
        - `useEffect`에서 `window.addEventListener('message', handleExtensionMessage)`를 등록하여 백엔드(`OrchestratorAgent`)로부터 메시지 수신.
        - `handleExtensionMessage`의 `switch` 문에서 `response`, `loadHistory`, `historyList`, `displayError` 등 커맨드를 처리하여 React 상태를 업데이트.
        - `vscodeService.postMessage`를 호출하여 `userQuery`, `newChat`, `selectChat` 등 사용자 액션을 백엔드로 전송.
    - **Rendering**: 상태에 따라 `Header`, `MessageList`, `InputArea`, `SettingsPage`, `WelcomeScreen`, `ErrorDisplay` 등 하위 컴포넌트를 조건부로 렌더링. 채팅 기록 패널(`renderHistoryPanel`)도 관리.

- **Child Components**:
    - `Header.tsx`: 새 채팅, 기록 보기, 설정, 자율 모드 토글 버튼 포함.
    - `MessageList.tsx`: `messages` 배열을 받아 채팅 목록을 렌더링.
    - `InputArea.tsx`: 사용자 입력 필드와 전송 버튼.
    - `SettingsPage.tsx`: 설정 UI.
    - `WelcomeScreen.tsx`: 초기 화면.
    - `ErrorDisplay.tsx`: 오류 메시지 표시.

- **`ui/services/vscode.ts`**:
    - `acquireVsCodeApi()`를 한 번만 호출하여 `vscode` 객체를 가져오고, `postMessage`를 감싼 `vscodeService` 객체를 내보내 UI 전체에서 일관되게 사용.

## 5. Build & Run Instructions

1.  **Clone**: `git clone <repository_url>`
2.  **Install**: `npm install`
3.  **Open**: VS Code에서 프로젝트 폴더 열기
4.  **Run**: `F5` 키를 눌러 "Extension Development Host" 창 실행.
5.  **Configure**: 새 창에서 `Ctrl+,`로 설정 열고 "Vibroboros" 검색하여 API 키 및 엔드포인트 설정.
