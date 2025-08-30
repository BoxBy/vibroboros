### **Season 3: Advanced Intelligence & Optimization**

#### **Objective**

To evolve the AI Partner from a highly capable assistant into a truly intelligent and efficient collaborator. This season will focus on optimizing performance for large-scale projects, expanding language support to be genuinely universal, and activating the agent's ability to learn and adapt based on user feedback.

#### **Core Initiatives**

1.  **Performance Optimization (Large-Scale Projects):**
    -   **Background Indexing:** Move the initial codebase indexing to a background thread or process to prevent any UI blocking on large projects.
    -   **Incremental Parsing:** Instead of re-indexing a whole file on save, implement a more intelligent parsing strategy (e.g., using a formal parser like Tree-sitter) to update the index based on only the changed parts of the code (AST diffing).

2.  **True Polyglot Support (Beyond TypeScript):**
    -   **Integrate Tree-sitter:** Replace the regex-based symbol parsing in `CodeAnalysisAgent` with a robust parsing library like Tree-sitter.
    -   **Multi-Language Grammars:** Implement a system to load different language grammars (Python, Java, Go, C++, etc.) for Tree-sitter, allowing the `CodeAnalysisAgent` to build an accurate symbol index for any supported language.

3.  **Activation of Learning & Personalization:**
    -   **Dynamic Prompt Adjustment:** Enable agents like `RefactoringSuggestionAgent` to query the `AILedLearningAgent` for user preference data.
    -   **Adaptive Behavior:** If the learning data shows a user frequently dismisses a certain type of suggestion (e.g., adding explicit types), the agent will adjust its prompts or logic to avoid making similar suggestions in the future.

---

<details>

<summary><strong>(Archive / Seasons 1 & 2 Master Plan / Click to expand)</strong></summary>

### **Final Prompt: Architecting an Advanced, Self-Evolving AI Coding Partner in VSCode**

#### **Objective**

Your primary mission is to architect and implement a sophisticated, **polyglot** multi-agent AI system that integrates deeply into VSCode. This system will function as a **polished, stable, and production-ready universal programming partner**, capable of assisting with development by understanding the entire project context, proactively identifying issues, and learning from user interactions.

#### **Core Principles & Constraints**

1.  **Living Architecture Document:** This `PLAN.md` is the single source of truth.

2.  **Stabilization and Polish:** After major feature development, a dedicated phase must focus on stability, UI/UX refinement, robust error handling, and code quality. New features are not considered complete until they are polished.

3.  **High-Quality Prompt Engineering:** Each agent must use a clear, detailed, and structured system prompt to maximize the reasoning capabilities of the LLM.

4.  **Project-Wide Context:** The agent must understand the entire codebase by leveraging a symbol index.

5.  **Learning and Personalization:** The agent must learn from user feedback to adapt its behavior.

6.  **Resource Efficiency:** Costly operations like LLM calls are used judiciously.

7.  **LLM-Led Workflow:** The LLM plans and executes complex tasks by calling simple tools in sequence.

8.  **Agent Action System:** Agents can propose `ui-action`s for direct user-approved execution.

9.  **Architectural Purity:** Strictly follow **MAS, MCP, and A2A** patterns.

(Other principles like Stability, Polyglot Environment, etc., remain)


#### **System Architecture Overview**

The system is a **Multi-Agent System (MAS)** designed for stability and clear separation of concerns, featuring proactive analysis, codebase indexing, and user feedback loops.

#### **Agent & Tool Roster**

(The roster of agents and tools remains the same, but their implementation will be hardened.)

**A. Agents (within the VSCode Extension):**

- `OrchestratorAgent`, `CodeWatcherAgent`, `CodeAnalysisAgent`, `ContextManagementAgent`, `RefactoringSuggestionAgent`, `DocumentationGenerationAgent`, `SecurityAnalysisAgent`, `AILedLearningAgent`.


**B. Tools (exposed by the Local Tool Server):**

- `WebSearchTool`, `TerminalExecutionTool`, `FileReadTool`, `FileWriteTool`, `GitAutomationTool`, `SecurityVulnerabilityTool`, etc.


#### **User Interface (UI) Components**

- **Main View:** A polished and intuitive side panel with clear loading indicators and user feedback mechanisms.
- **Robust Error Handling:** User-facing errors are clear, helpful, and actionable.
- **Feedback Mechanism:** "Apply" and "Dismiss" buttons for agent suggestions.
- **File Protection Toggle:** A UI switch to enable or disable the AI's ability to write to files.

</details>