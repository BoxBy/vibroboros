# 작업 목록: UI 고급 폴리싱 (Gemini 스타일)

## 목표
- Gemini Code Assist와 같이 전문적이고 VSCode에 완벽하게 통합된 UI 경험을 제공합니다.

## 세부 작업
- [x] **1. VSCode UI Toolkit 통합:**
	- [x] `@vscode/webview-ui-toolkit` 라이브러리를 `package.json`에 추가하고 설치합니다.
	- [x] 기존 HTML 요소(button, input)들을 Toolkit 컴포넌트(`<vscode-button>` 등)로 교체합니다.

- [ ] **2. 레이아웃 구조화:**
	- [ ] `ChatView.tsx`를 `Header`, `MessageList`, `InputArea` 컴포넌트로 분리하여 리팩토링합니다.
	- [ ] `Header` 컴포넌트에 제목과 아이콘 버튼(설정, 새로고침)을 추가합니다.
	- [ ] `InputArea` 컴포넌트에 `@` 참조, 파일 첨부 아이콘 등을 추가하여 기능을 확장합니다.

- [ ] **3. 스타일링 및 테마 적용:**
	- [ ] UI 전체에 VSCode CSS 변수(`--vscode-*`)를 사용하여 테마가 일관되게 적용되도록 수정합니다.
	- [ ] 사용자 메시지와 AI 응답 메시지의 스타일을 구분하고, 코드 블록에 대한 구문 강조(Syntax Highlighting)를 적용합니다.
	- [ ] AI 응답 대기 시간을 위한 로딩 인디케이터를 추가합니다.

- [ ] **4. WelcomeScreen 개선:**
	- [x] `WelcomeScreen.tsx`에 기능 예시(Refactor, Explain 등)를 명확하게 보여주는 섹션을 추가하여 재설계합니다.