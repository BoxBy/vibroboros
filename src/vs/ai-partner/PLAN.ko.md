# Vibroborus 리팩토링 계획

## 목표
vibroborus 프로젝트의 아키텍처를 리팩토링하여 UI(웹뷰)와 에이전트(백그라운드 로직)를 명확하게 분리하고, geminicodeassist의 강력하고 확장 가능한 아키텍처를 모델로 삼습니다.

## 채택할 핵심 원칙
1.  **관심사 분리:** UI(웹뷰)는 렌더링 및 사용자 입력만 담당합니다. 핵심 로직은 백그라운드 에이전트가 처리합니다.
2.  **메시지 기반 통신:** `vscode.postMessage()`를 통한 UI와 에이전트 간의 비동기 통신.
3.  **중앙 집중식 오케스트레이션:** 메인 에이전트(OrchestratorAgent)가 작업을 수신, 해석 및 위임합니다.

## 실행 가능한 지침

### 1. UI 및 에이전트 로직 분리
-   **파일:** `src/vs/ai-partner/AIPartnerViewProvider.ts`
-   **작업:**
    -   UI 이벤트 처리와 비즈니스 로직을 분리합니다.
    -   `AIPartnerViewProvider.ts`는 웹뷰를 생성하고 사용자 이벤트를 `extension.ts`의 "에이전트 호스트"로 전달하는 역할만 합니다.
    -   모든 UI 요청은 `vscode.postMessage()`를 사용합니다.

### 2. '오케스트레이터 에이전트' 기능 향상
-   **파일:** `src/vs/ai-partner/agents/OrchestratorAgent.ts`, `src/vs/ai-partner/extension.ts`
-   **작업:**
    -   `extension.ts`에 `AIPartnerViewProvider`와 `OrchestratorAgent` 간의 중재자 역할을 하는 "에이전트 호스트"를 구현합니다.
    -   `OrchestratorAgent.ts`를 모든 요청의 단일 진입점으로 만듭니다.
    -   사용자 의도를 파싱하고 전문 에이전트에게 위임합니다.
    -   전문 에이전트의 결과를 포맷하여 UI로 다시 보냅니다.

### 3. 사용자 경험(UX) 향상 구현
-   **작업: 스트리밍 응답 구현**
    -   **파일:** `OrchestratorAgent.ts`, 전문 에이전트, `AIPartnerViewProvider.ts`, UI 측 코드.
    -   **액션:** 점진적 렌더링을 위해 LLM 응답을 UI에 청크 단위로 스트리밍합니다.
-   **작업: 작업 상태 피드백 추가**
    -   **파일:** 모든 에이전트 파일, UI 측 코드.
    -   **액션:** 에이전트가 실시간 상태 업데이트("파일 분석 중...")를 UI로 보낼 수 있는 메시지 채널을 생성합니다.

## 결과물
1.  완전하고 리팩토링된 소스 코드.
2.  아키텍처 변경 사항을 요약한 `REFACTOR_SUMMARY.md`.

## 제약 조건
-   기존 핵심 기능에 대한 호환성 문제 방지.
-   기존 코딩 스타일 준수.
-   새로운 아키텍처에 대한 명확한 주석 처리.
