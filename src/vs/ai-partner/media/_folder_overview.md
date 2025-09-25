# Folder: src/vs/ai-partner/media

## Role
This directory stores static assets for the AI Partner's webview UI. This includes stylesheets (CSS), client-side scripts (JavaScript), and images (SVG).

## File Breakdown
- **`main.css`**: The primary stylesheet for the webview UI. It defines the look and feel of the chat interface, buttons, and other visual elements.
- **`main.js`**: Contains client-side JavaScript logic for the webview. This script handles user interactions, communication with the extension backend (via the VS Code API), and dynamic UI updates.
- **`logo.svg`**: The logo image for the AI Partner, displayed in the UI.

## AI Reading Guide
- To change the visual appearance of the UI, modify `main.css`.
- For client-side interactivity and communication logic within the webview, analyze and edit `main.js`.
- Note: The modern UI seems to be built with React in the `ui/` directory, which may supersede the direct use of `main.js` and `main.css` for newer views. Check `AIPartnerViewProvider.ts` to see how these assets are loaded.
