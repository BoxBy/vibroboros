# Folder: src/vs/ai-partner/ui/services

## Role
This directory provides services specifically for the React-based UI. These services abstract away the complexities of interacting with the underlying VS Code environment from within the webview.

## File Breakdown
- **`vscode.ts`**: This is a crucial utility file. It wraps the `acquireVsCodeApi()` function and provides strongly-typed methods for sending messages from the webview (React UI) to the extension host (backend) and for handling messages received from the host. It acts as the primary bridge between the UI and the rest of the extension.

## AI Reading Guide
- **This file is essential for understanding UI-backend communication.**
- To add a new message type from the UI to the backend, you should add a new method in this file.
- When a UI component needs to send data to or request data from the extension, it should use the functions provided by `vscode.ts`.
