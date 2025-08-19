<details>

<summary><strong>(Click to expand)</strong></summary>

### **Final Prompt: Architecting an Advanced, Self-Evolving AI Coding Partner in VSCode**

#### **Context Document Notice**

This plan requires implementation of the Model-Controller-Protocol (MCP) server architecture. If you have not been provided with the MCP documentation that describes its client-server model, tool exposure, and connection flow, **you must ask for it before proceeding.**

#### **Objective**

Your primary mission is to architect and implement a sophisticated, multi-agent AI system that integrates deeply into a forked version of the `Microsoft/vscode` repository. This system will function as an advanced, context-aware coding partner that proactively assists developers, improves code quality, learns from interaction, and streamlines the entire development lifecycle.

#### **Core Principles & Constraints**

1. **Technology Stack & Environment:** This project must be developed as a **VSCode Extension** using **TypeScript**. You are expected to be familiar with the VSCode Extension API.

2. **Multilingual Support & Language Separation:** The AI's **conversational responses** must dynamically match the VSCode UI language (retrieved from `vscode.env.language`). However, all generated **code artifacts**—including code, in-code comments, and technical documents—must **always be written in English**.

3. **Stability and Robustness:** All generated code must be production-quality, robust, and error-free. You must consider side effects on the VSCode host environment.

4. **Incremental & Phased Development:** You will deliver the solution in logical, incremental phases. Do not provide the entire codebase at once.

5. **Rigorous Self-Correction:** After generating code, you must perform a self-review for correctness, efficiency, and adherence to all principles.

6. **Architectural Purity:** The system must strictly follow the specified **MAS, MCP, and A2A** patterns. Avoid high-level, opaque AI frameworks (e.g., LangChain).

7. **Knowledge Request & Clarification:** If you are unsure about a specific architectural pattern (e.g., MCP), a VSCode Extension API, or the best practice for implementing a feature, **you must never proceed based on assumption.** Instead, you must ask the user for clarification or examples.

8. **Upstream Sync Resilience:** The entire system must be implemented as a highly modular and isolated extension to ensure functionality after `Sync Fork`.

9. **Model Flexibility & Resilience:** The system must use an **OpenAI-compatible API interface**. The user must be able to provide multiple API keys. If a `QuotaLimit` error occurs, the system must automatically rotate to the next available key.


#### **System Architecture Overview**

The system is a **Multi-Agent System (MAS)** operating on a client-server model based on the **Model-Controller-Protocol (MCP)**.

1. **VSCode Extension (The MCP Client):** This is the main user-facing component.

2. **Local Tool Server (The MCP Server):** A separate, local server application responsible for interacting with the external environment.

3. **LLM Control & Optimization Service:** A critical service, likely within the VSCode extension, that all agents use to communicate with an LLM.

4.  **Intelligent Auto-Fixing:** Beyond simple suggestions, the system actively identifies errors and warnings within a file by integrating with VSCode's diagnostics system (linters, compilers, etc.). It provides the capability to automatically fix these issues via the `RefactoringAgent`, helping developers easily improve code quality and reduce maintenance time.


#### **Agent & Tool Roster**

**A. Agents (within the VSCode Extension):**

- `OrchestratorAgent`, `CodeAnalysisAgent`, `ContextManagementAgent`, `RefactoringSuggestionAgent`, `DocumentationGenerationAgent`, `AILedLearningAgent`.


**B. Tools (exposed by the Local Tool Server):**

- `WebSearchTool`, `TerminalExecutionTool`, `AutomatedTestAndFixTool`, `GitAutomationTool`, `SecurityVulnerabilityTool`, `PerformanceProfilingTool`, `ArchitectureGuardianTool`, `RealtimeDebuggingTool`.


#### **User Interface (UI) Components**

- **Main View:** A side panel view to display context and manage interactions.

- **File Protection:** A file-level toggle to protect files from AI modification.

- **Settings Page:** Includes sections for **Connectors** and **LLM Configuration**.


#### **Phased Development Plan & Initial Task**

**Your first task is to design the detailed data schemas and interfaces.** Please provide the TypeScript `interface` definitions for:

1. The standard **A2A message format**.

2. The `CodeSummary` and `CallGraph` data structures.

3. The **MCP message format** for client-server communication.


</details>