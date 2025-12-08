# 폴더: src/vs/ai-partner/ui

## 역할
이 디렉터리는 AI 파트너를 위한 React/Vite 기반 웹뷰 UI를 포함합니다. 채팅, 플랜, diff, 상태 메시지를 렌더링하고 VS Code 웹뷰 API를 통해 확장 호스트와 통신합니다.

## 구조 개요
- **React 컴포넌트(`*.tsx`)** – 채팅 뷰, 입력 영역, 메시지 리스트, 플랜 뷰, diff 뷰 등 주요 화면을 구현합니다 (예: `MainView.tsx`, `ChatView.tsx`, `InputArea.tsx`, `MessageList.tsx` 등).
- **엔트리 포인트** – `index.tsx`가 웹뷰 내부에서 React 앱을 부트스트랩합니다.
- **서비스** – `services/vscode.ts`는 `acquireVsCodeApi()`를 감싸고, UI와 확장 백엔드 사이의 메시지 송수신을 위한 타입 안전 헬퍼를 제공합니다.
- **자산/설정** – Vite/TypeScript 설정 및 UI 전용 자산(존재하는 경우)이 컴포넌트 옆에 위치합니다.

## AI 분석 가이드
- 사용자가 AI 파트너와 어떻게 상호작용하는지 이해하려면 `MainView.tsx`부터 읽고, 채팅/플랜/diff 뷰가 어떻게 렌더링되는지 따라가세요.
- UI와 백엔드 간 메시지 흐름을 보려면 `services/vscode.ts`를 읽은 뒤, `AIPartnerViewProvider`를 통해 `extension.ts`가 이러한 메시지를 어떻게 처리하는지 확인하세요.
- 새로운 UI 기능을 설계할 때는 기존 컴포넌트 패턴을 따르고, 통신은 반드시 `vscode` 서비스 레이어를 통해 이루어지도록 유지하세요.
