<details>

<summary><strong>(Master Plan / Click to expand)</strong></summary>

### **Final Prompt: Architecting an Advanced, Self-Evolving AI Coding Partner in VSCode**

#### **Context Document Notice**

This plan requires implementation of the Model-Controller-Protocol (MCP) server architecture. If you have not been provided with the MCP documentation that describes its client-server model, tool exposure, and connection flow, **you must ask for it before proceeding.**

#### **Objective**

Your primary mission is to architect and implement a sophisticated, **polyglot** multi-agent AI system that integrates deeply into VSCode. This system will function as a **universal programming partner**, capable of assisting with development across a wide range of programming languages and technologies.

#### **Core Principles & Constraints**

1.  **Polyglot & Extensible Environment:** While the core extension is built with **TypeScript**, the agent system is designed to be a **universal programming partner**, capable of understanding, analyzing, and generating code in any programming language. Its tools and agents must be built with language agnosticism in mind.

2.  **LLM-Led Workflow:** The system favors an LLM-led workflow. Instead of creating large, complex, hard-coded "composite tools", we will provide the LLM with a rich set of simple, single-purpose tools. The LLM itself is responsible for planning and executing complex tasks by calling these simple tools in sequence. The `OrchestratorAgent` acts as the executor for the LLM's plans.

3.  **Multilingual Support & Language Separation:** The AI's **conversational responses** must match the VSCode UI language, but all **code artifacts** must be **English**.

4.  **Stability and Robustness:** All code must be production-quality.

5.  **Incremental & Phased Development:** Deliver the solution in logical, incremental phases.

6.  **Rigorous Self-Correction:** Self-review code after generation.

7.  **Architectural Purity:** Strictly follow **MAS, MCP, and A2A** patterns. Avoid opaque frameworks.

8.  **Knowledge Request & Clarification:** **Never proceed based on assumption.** Ask the user for clarification on APIs or patterns.

9.  **Upstream Sync Resilience:** Implement as a highly modular and isolated extension.

10. **Model Flexibility & Resilience:** Use an **OpenAI-compatible API** and support key rotation.


#### **System Architecture Overview**

The system is a **Multi-Agent System (MAS)** operating on an MCP-based client-server model. It includes a VSCode Extension (Client), a Local Tool Server, and an LLM Control Service. The distinction between **A2A (internal)** and **MCP (external)** communication is critical.

#### **Agent & Tool Roster**

**A. Agents (within the VSCode Extension):**

- `OrchestratorAgent`: The MCP Client, directs all workflows by executing plans and tool calls formulated by the LLM.

- `CodeAnalysisAgent`: Parses code, generates summaries, and builds the call graph. **It is also responsible for initializing and maintaining the `.gitignore` file by suggesting appropriate entries based on the project's technology stack.**

- `ContextManagementAgent`: Selects relevant context for prompts.

- `RefactoringSuggestionAgent`: Suggests code improvements.

- `DocumentationGenerationAgent`: Creates and updates `README.md` files.

- `AILedLearningAgent`: Learns user's style and patterns.


**B. Tools (exposed by the Local Tool Server):**

- `WebSearchTool`: Executes web searches.

- `TerminalExecutionTool`: Runs terminal commands (e.g., unit tests).

- `TestGenerationTool`: Generates unit test code for a given file or function, leveraging the LLM.

- `GitAutomationTool`: Prepares git commands for user confirmation.

- `SecurityVulnerabilityTool`: Performs static analysis (SAST).

- `PerformanceProfilingTool`: Identifies performance bottlenecks.

- `ArchitectureGuardianTool`: Enforces architectural rules.

- `RealtimeDebuggingTool`: Integrates with the debugger.


#### **User Interface (UI) Components**

- **Main View:** A side panel for context and interactions.

- **File Protection:** A toggle to protect files from AI modification.

- **Settings Page:** For **Connectors** (MCP Server) and **LLM Configuration**.

</details>