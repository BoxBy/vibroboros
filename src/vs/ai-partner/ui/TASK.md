# Tasks for: UI Advanced Polishing (Gemini Style)

## Objective
- To deliver a professional and seamlessly integrated UI experience, similar to Gemini Code Assist.

## Sub-Tasks
- [x] **1. Integrate VSCode UI Toolkit:**
	- [x] Add `@vscode/webview-ui-toolkit` library to `package.json` and install.
	- [x] Replace existing HTML elements (button, input) with Toolkit components (`<vscode-button>`, etc.).

- [ ] **2. Refactor Layout Structure:**
	- [ ] Refactor `ChatView.tsx` into `Header`, `MessageList`, and `InputArea` components.
	- [ ] Add title and icon buttons (Settings, Refresh) to the `Header` component.
	- [ ] Enhance the `InputArea` component with `@` mention and file attachment icons.

- [ ] **3. Apply Polished Styling & Theming:**
	- [ ] Use VSCode CSS variables (`--vscode-*`) throughout the UI for consistent theming.
	- [ ] Differentiate user and AI message styles, and apply syntax highlighting to code blocks.
	- [ ] Add a loading indicator for when the AI is responding.

- [ ] **4. Enhance WelcomeScreen:**
	- [x] Redesign `WelcomeScreen.tsx` to clearly display feature examples (Refactor, Explain, etc.).