# Folder: .vscode

## Role
This directory contains workspace-specific settings for Visual Studio Code. These settings help ensure a consistent development environment for all contributors.

## File Breakdown
- **`launch.json`**: Defines debugging configurations, allowing you to run and debug the extension directly from VS Code.
- **`tasks.json`**: Defines custom tasks that can be run from the command palette, such as build, test, or lint tasks.
- **`settings.json`**: Contains workspace-specific editor settings, such as formatting preferences, linter rules, and file associations.
- **`extensions.json`**: Recommends other VS Code extensions that are useful for developing this project (e.g., ESLint, Prettier).

## AI Reading Guide
- To run and debug the extension, use the configurations in `launch.json`.
- To understand the build process, check the tasks in `tasks.json` and the root `package.json` scripts.
