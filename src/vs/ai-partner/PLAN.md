<details>

<summary><strong>(Master Plan / Click to expand)</strong></summary>

### **Final Prompt: Architecting an Advanced, Self-Evolving AI Coding Partner in VSCode**

#### **Objective**

Your primary mission is to architect and implement a sophisticated, **polyglot** multi-agent AI system that integrates deeply into VSCode. This system will function as a **universal programming partner**, capable of assisting with development by **understanding the entire project context**, proactively identifying issues, and learning from user interactions.

#### **Core Principles & Constraints**

1.  **Living Architecture Document:** This `PLAN.md` is the single source of truth.

2.  **High-Quality Prompt Engineering:** The performance of the system is critically dependent on the quality of its prompts. Each agent must use a clear, detailed, and structured system prompt, tailored to its specific task, to maximize the reasoning capabilities of the LLM.

3.  **Project-Wide Context:** The agent must understand the entire codebase, not just the active file, by leveraging a symbol index.

4.  **Learning and Personalization:** The agent must learn from user feedback to adapt its behavior.

5.  **Resource Efficiency:** Costly operations like LLM calls are used judiciously.

6.  **LLM-Led Workflow:** The LLM plans and executes complex tasks by calling simple tools in sequence.

7.  **Agent Action System:** Agents can propose `ui-action`s for direct user-approved execution.

8.  **Architectural Purity:** Strictly follow **MAS, MCP, and A2A** patterns.

(Other principles like Stability, Polyglot Environment, etc., remain)


#### **System Architecture Overview**

The system is a **Multi-Agent System (MAS)**. A `CodeWatcherAgent` monitors file changes to trigger proactive analysis and re-indexing. An `AILedLearningAgent` processes user feedback. A `CodeAnalysisAgent` maintains the project-wide symbol index.

#### **Agent & Tool Roster**

**A. Agents (within the VSCode Extension):**

- `OrchestratorAgent`: Directs all user-facing workflows and is responsible for constructing high-quality, structured system prompts that synthesize all available context (active file, codebase search results, etc.) for the LLM.
- `CodeWatcherAgent`: A background agent that observes file-save events and triggers re-indexing and analysis.
- `CodeAnalysisAgent`: The project indexing and search engine.
- `ContextManagementAgent`: Uses the `CodeAnalysisAgent` to find relevant code snippets from across the entire project.
- `RefactoringSuggestionAgent`: A specialized agent for refactoring.
- `DocumentationGenerationAgent`: A specialized agent for generating documentation.
- `SecurityAnalysisAgent`: A specialized agent that performs security checks.
- `AILedLearningAgent`: A specialized agent that processes user feedback.


**B. Tools (exposed by the Local Tool Server):**

- `CodebaseSearchTool`: (Functionality now integrated into `CodeAnalysisAgent`)
- `WebSearchTool`, `TerminalExecutionTool`, `FileReadTool`, `FileWriteTool`, `GitAutomationTool`, `SecurityVulnerabilityTool`, etc.


#### **User Interface (UI) Components**

- **Main View:** A side panel with navigation between Chat and Settings.
- **Feedback Mechanism:** "Apply" and "Dismiss" buttons for agent suggestions.
- **File Protection Toggle:** A UI switch to enable or disable the AI's ability to write to files.

</details>