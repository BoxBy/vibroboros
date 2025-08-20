<details>

<summary><strong>(Master Plan / Click to expand)</strong></summary>

### **Final Prompt: Architecting an Advanced, Self-Evolving AI Coding Partner in VSCode**

#### **Objective**

Your primary mission is to architect and implement a sophisticated, **polyglot** multi-agent AI system that integrates deeply into VSCode. This system will function as a **universal programming partner**, capable of assisting with development across a wide range of programming languages and technologies, including **proactively** identifying potential issues.

#### **Core Principles & Constraints**

1.  **Living Architecture Document:** This `PLAN.md` is the single source of truth. All new features must be reflected here before implementation.

2.  **Resource Efficiency:** The system must be mindful of resource consumption. Costly operations like LLM calls should be triggered by explicit user commands or after a cheaper, preliminary analysis (e.g., regex-based tool) indicates a high probability of a significant issue.

3.  **LLM-Led Workflow:** The LLM is responsible for planning and executing complex tasks by calling simple, single-purpose tools in sequence.

4.  **Agent Action System:** Specialized agents can propose `ui-action`s. Clicking them sends an `executeTool` command to the `OrchestratorAgent` for direct execution.

5.  **Polyglot & Extensible Environment:** The system is a universal programming partner.

6.  **Multilingual Support & Language Separation:** Conversational responses match the UI language, but code artifacts are in English.

7.  **Stability and Robustness:** All code must be production-quality.

8.  **Incremental & Phased Development:** Deliver the solution in logical, incremental phases.

9.  **Rigorous Self-Correction:** Self-review code after generation.

10. **Architectural Purity:** Strictly follow **MAS, MCP, and A2A** patterns.

11. **Knowledge Request & Clarification:** **Never proceed based on assumption.**

12. **Upstream Sync Resilience:** Implement as a highly modular and isolated extension.

13. **Model Flexibility & Resilience:** Use an **OpenAI-compatible API** and support key rotation.


#### **System Architecture Overview**

The system is a **Multi-Agent System (MAS)**. A new `CodeWatcherAgent` will monitor file changes to trigger proactive analysis from other specialized agents.

#### **Agent & Tool Roster**

**A. Agents (within the VSCode Extension):**

- `OrchestratorAgent`: The MCP Client, directs all user-facing workflows.
- `CodeWatcherAgent`: A background agent that observes file-save events and triggers analysis from other agents.
- `CodeAnalysisAgent`: Parses code, generates summaries, and builds the call graph.
- `ContextManagementAgent`: Selects relevant context for prompts.
- `RefactoringSuggestionAgent`: A specialized agent that handles refactoring, both reactively (on user command) and proactively (triggered by the CodeWatcherAgent).
- `DocumentationGenerationAgent`: A specialized agent for generating documentation.
- `SecurityAnalysisAgent`: A new specialized agent that performs security checks, primarily using non-LLM tools.
- `AILedLearningAgent`: Learns user's style and patterns.


**B. Tools (exposed by the Local Tool Server):**

- `WebSearchTool`: Executes web searches.
- `TerminalExecutionTool`: Runs terminal commands.
- `FileReadTool`: Reads the content of a specified file.
- `FileWriteTool`: Writes content to a specified file.
- `GitAutomationTool`: Prepares git commands for user confirmation.
- `SecurityVulnerabilityTool`: Performs fast, regex-based static analysis to find common vulnerabilities (e.g., hardcoded keys) without calling an LLM.
- `PerformanceProfilingTool`: Identifies performance bottlenecks.
- `ArchitectureGuardianTool`: Enforces architectural rules.
- `RealtimeDebuggingTool`: Integrates with the debugger.


#### **User Interface (UI) Components**

- **Main View:** A side panel with navigation between Chat, Settings, and a new Diagnostics view.
- **Diagnostics View:** A dedicated tab where proactive analysis results (security warnings, refactoring suggestions) are displayed without interrupting the user.
- **File Protection Toggle:** A UI switch to enable or disable the AI's ability to write to files.
- **Action Buttons:** Dynamically rendered buttons proposed by agents.
- **Settings Page:** For **Connectors** (MCP Server) and **LLM Configuration**.

</details>