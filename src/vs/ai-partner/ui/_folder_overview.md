# Folder: src/vs/ai-partner/ui

## Role
This directory contains the source code for the modern, webview-based user interface, which is built using React (or a similar framework like Preact/Solid, indicated by `.tsx` files and `vite.config.ts`).

## Structure Overview
- **Components (`.tsx`)**: The directory contains various React components that make up the UI, such as `ChatView.tsx`, `InputArea.tsx`, `MessageList.tsx`, `PlanView.tsx`, etc.
- **Entry Point**: `index.tsx` is the main entry point for the React application that runs inside the webview.
- **Build Configuration**: `vite.config.ts`, `package.json`, and `tsconfig.json` are used to build and bundle the UI code into static assets that can be loaded by the webview.
- **Styling**: `styles.css` contains the styles for the React components.
- **Services**: The `services/` subdirectory contains UI-specific helper functions, especially for communicating with the VS Code extension host.

## AI Reading Guide
- To understand the structure and appearance of the AI Partner's chat interface, start with `MainView.tsx` and `ChatView.tsx`.
- To modify how the user inputs messages, see `InputArea.tsx`.
- `services/vscode.ts` is critical for understanding how the UI sends messages to and receives messages from the extension backend.
- This is a standard React/Vite project. To make changes, you may need to run `npm install` in this directory and then run a build command defined in `package.json`.
