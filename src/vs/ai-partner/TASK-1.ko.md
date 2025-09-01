# 작업 1: UI 및 에이전트 로직 분리

## 목표
`AIPartnerViewProvider.ts`를 리팩토링하여 UI 로직과 비즈니스 로직을 분리합니다. 이 프로바이더는 웹뷰를 생성하고 새로운 에이전트 호스트와의 통신을 관리하는 역할만 담당해야 합니다.

## 주요 단계

1.  **`AIPartnerViewProvider.ts` 분석:**
    -   비즈니스 로직과 관련된 모든 코드(예: API 호출, 파일 시스템 작업 처리, 상태 관리)를 식별합니다.
    -   모든 UI 이벤트 리스너와 현재 비즈니스 로직을 트리거하는 방식을 식별합니다.

2.  **`AIPartnerViewProvider.ts` 리팩토링:**
    -   이 파일에서 모든 비즈니스 로직을 제거합니다.
    -   `vscode.postMessage()`를 사용하여 웹뷰에 메시지를 전달하도록 이벤트 핸들러를 수정합니다.
    -   이제 프로바이더는 웹뷰와 확장 프로그램의 메인 프로세스 간의 간단한 메시지 전달자 역할을 합니다.

3.  **에이전트 호스트 구현 (`extension.ts`):**
    -   `extension.ts`에 `AIPartnerViewProvider`로부터 메시지를 수신할 메시지 핸들러를 생성합니다.
    -   이 호스트는 `OrchestratorAgent`의 인스턴스를 생성하는 역할을 담당합니다.
    -   UI에서 들어오는 메시지를 처리를 위해 `OrchestratorAgent`로 전달합니다.

## 예상 결과
-   `AIPartnerViewProvider.ts`가 UI 관련 설정 및 메시지 전달 코드만 포함하도록 크게 단순화됩니다.
-   모든 비즈니스 로직은 `OrchestratorAgent`를 통해 `extension.ts`에서 시작됩니다.
-   UI와 에이전트 간의 통신은 순수하게 메시지 기반으로 이루어집니다.
