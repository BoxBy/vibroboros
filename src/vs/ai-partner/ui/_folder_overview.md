# Folder: src/vs/ai-partner/ui

## Role
This directory contains the React/Vite-based webview UI for the AI Partner. It renders chat, plans, diffs, and status messages, and communicates with the extension host via the VS Code webview API.

## Structure Overview
- **React Components (`*.tsx`)** – Implement the chat view, input area, message list, plan view, diff view, and other panels (e.g. `MainView.tsx`, `ChatView.tsx`, `InputArea.tsx`, `MessageList.tsx`, etc.).
- **Entry Point** – `index.tsx` bootstraps the React app inside the webview.
- **Services** – `services/vscode.ts` wraps `acquireVsCodeApi()` and provides typed helpers for sending/receiving messages between the UI and the extension backend.
- **Assets/Config** – Vite/TypeScript configuration and any UI-specific assets (if present) live alongside the components.

## AI Reading Guide
- To understand how the user interacts with the AI Partner, start with `MainView.tsx` and follow how it renders chat, plans, and diff views.
- To see how messages flow between the UI and the backend, read `services/vscode.ts` and then check how `extension.ts` handles those messages via `AIPartnerViewProvider`.
- When designing new UI features, follow the existing component patterns and keep communication strictly via the `vscode` service.
