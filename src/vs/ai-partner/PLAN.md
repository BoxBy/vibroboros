<details>

<summary><strong>(Master Plan / Click to expand)</strong></summary>

### **Final Prompt: Architecting an Advanced, Self-Evolving AI Coding Partner in VSCode**

#### **Context Document Notice**

This plan requires implementation of the Model-Controller-Protocol (MCP) server architecture. If you have not been provided with the MCP documentation that describes its client-server model, tool exposure, and connection flow, **you must ask for it before proceeding.**

#### **Objective**

Your primary mission is to architect and implement a sophisticated, **polyglot** multi-agent AI system that integrates deeply into VSCode. This system will function as a **universal programming partner**, capable of assisting with development across a wide range of programming languages and technologies.

#### **Core Principles & Constraints**

1.  **Living Architecture Document:** This `PLAN.md` is the single source of truth for the project's architecture and goals. Any new features, tools, or significant architectural changes proposed by the AI and approved by the user **must be reflected in this document before implementation begins.**

2.  **LLM-Led Workflow:** The system favors an LLM-led workflow. The LLM itself is responsible for planning and executing complex tasks by calling simple, single-purpose tools in sequence. The `OrchestratorAgent` acts as the executor for the LLM's plans.

3.  **Agent Action System:** Specialized agents can propose `ui-action`s to the user (e.g., buttons). When the user clicks an action button, the UI sends a dedicated `executeTool` command to the `OrchestratorAgent`, which then executes the specified tool with its arguments, bypassing the main LLM loop for direct, user-approved actions.

4.  **Polyglot & Extensible Environment:** The core extension is built with **TypeScript**, but the agent system is designed to be a **universal programming partner**.

5.  **Multilingual Support & Language Separation:** Conversational responses match the UI language, but code artifacts are in English.

6.  **Stability and Robustness:** All code must be production-quality.

7.  **Incremental & Phased Development:** Deliver the solution in logical, incremental phases.

8.  **Rigorous Self-Correction:** Self-review code after generation.

9.  **Architectural Purity:** Strictly follow **MAS, MCP, and A2A** patterns.

10. **Knowledge Request & Clarification:** **Never proceed based on assumption.**

11. **Upstream Sync Resilience:** Implement as a highly modular and isolated extension.

12. **Model Flexibility & Resilience:** Use an **OpenAI-compatible API** and support key rotation.


#### **System Architecture Overview**

The system is a **Multi-Agent System (MAS)** operating on an MCP-based client-server model. It includes a VSCode Extension (Client), a Local Tool Server, and an LLM Control Service. The distinction between **A2A (internal)** and **MCP (external)** communication is critical.

#### **Agent & Tool Roster**

**A. Agents (within the VSCode Extension):**

- `OrchestratorAgent`: The MCP Client, directs all workflows by executing plans and tool calls formulated by the LLM.

- `CodeAnalysisAgent`: Parses code, generates summaries, and builds the call graph.

- `ContextManagementAgent`: Selects relevant context for prompts.

- `RefactoringSuggestionAgent`: A specialized agent that handles refactoring workflows.

- `DocumentationGenerationAgent`: A specialized agent that reads a file, uses the LLM to generate documentation, and proposes an action to write the result to a file (e.g., `README.md`).

- `AILedLearningAgent`: Learns user's style and patterns.


**B. Tools (exposed by the Local Tool Server):**

- `WebSearchTool`: Executes web searches.
- `TerminalExecutionTool`: Runs terminal commands.
- `FileReadTool`: Reads the content of a specified file.
- `FileWriteTool`: Writes content to a specified file.
- `GitAutomationTool`: Prepares git commands for user confirmation.
- `SecurityVulnerabilityTool`: Performs static analysis (SAST).
- `PerformanceProfilingTool`: Identifies performance bottlenecks.
- `ArchitectureGuardianTool`: Enforces architectural rules.
- `RealtimeDebuggingTool`: Integrates with the debugger.


#### **User Interface (UI) Components**

- **Main View:** A side panel for context and interactions, with navigation between different views.

- **File Protection Toggle:** A UI switch that allows the user to enable or disable the AI's ability to write to files.

- **Action Buttons:** Dynamically rendered buttons proposed by agents. Clicking them sends a structured `executeTool` command to the `OrchestratorAgent`.

- **Settings Page:** For **Connectors** (MCP Server) and **LLM Configuration**.

</details>