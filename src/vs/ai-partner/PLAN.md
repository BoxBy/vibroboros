<details>

<summary><strong>(Master Plan / Click to expand)</strong></summary>

### **Final Prompt: Architecting an Advanced, Self-Evolving AI Coding Partner in VSCode**

#### **Objective**

Your primary mission is to architect and implement a sophisticated, **polyglot** multi-agent AI system that integrates deeply into VSCode. This system will function as a **universal programming partner**, capable of assisting with development by **understanding the entire project context**, proactively identifying issues, and learning from user interactions.

#### **Core Principles & Constraints**

1.  **Living Architecture Document:** This `PLAN.md` is the single source of truth.

2.  **Project-Wide Context:** The agent must understand the entire codebase, not just the active file. It achieves this by building and maintaining a symbol index of the project, enabling semantic search and a deep understanding of code relationships.

3.  **Learning and Personalization:** The agent must learn from user feedback to adapt its behavior.

4.  **Resource Efficiency:** Costly operations like LLM calls are used judiciously.

5.  **LLM-Led Workflow:** The LLM plans and executes complex tasks by calling simple tools in sequence.

6.  **Agent Action System:** Agents can propose `ui-action`s for direct user-approved execution.

7.  **Polyglot & Extensible Environment:** The system is a universal programming partner.

8.  **Architectural Purity:** Strictly follow **MAS, MCP, and A2A** patterns.

(Other principles like Stability, Incremental Development, etc., remain)


#### **System Architecture Overview**

The system is a **Multi-Agent System (MAS)**. A `CodeWatcherAgent` monitors file changes to trigger proactive analysis and re-indexing. An `AILedLearningAgent` processes user feedback. A `CodeAnalysisAgent` maintains the project-wide symbol index.

#### **Agent & Tool Roster**

**A. Agents (within the VSCode Extension):**

- `OrchestratorAgent`: Directs all user-facing workflows.
- `CodeWatcherAgent`: A background agent that observes file-save events and triggers re-indexing and analysis.
- `CodeAnalysisAgent`: **The project indexing engine.** Builds and maintains a project-wide symbol index (functions, classes, etc.) to enable semantic search capabilities.
- `ContextManagementAgent`: Uses the `CodebaseSearchTool` to find relevant code snippets from across the entire project to provide rich context to the LLM.
- `RefactoringSuggestionAgent`: A specialized agent for refactoring.
- `DocumentationGenerationAgent`: A specialized agent for generating documentation.
- `SecurityAnalysisAgent`: A specialized agent that performs security checks.
- `AILedLearningAgent`: A specialized agent that processes user feedback.


**B. Tools (exposed by the Local Tool Server):**

- `CodebaseSearchTool`: A new tool that searches the symbol index for definitions or usages of a given symbol (function, class, etc.).
- `WebSearchTool`, `TerminalExecutionTool`, `FileReadTool`, `FileWriteTool`, `GitAutomationTool`, `SecurityVulnerabilityTool`, etc.


#### **User Interface (UI) Components**

- **Main View:** A side panel with navigation between Chat and Settings.
- **Feedback Mechanism:** "Apply" and "Dismiss" buttons for agent suggestions.
- **File Protection Toggle:** A UI switch to enable or disable the AI's ability to write to files.

</details>