<details>

<summary><strong>(Master Plan / Click to expand)</strong></summary>

### **Final Prompt: Architecting an Advanced, Self-Evolving AI Coding Partner in VSCode**

#### **Objective**

Your primary mission is to architect and implement a sophisticated, **polyglot** multi-agent AI system that integrates deeply into VSCode. This system will function as a **universal programming partner**, capable of assisting with development across a wide range of programming languages and technologies, including **proactively** identifying potential issues and **learning** from user interactions.

#### **Core Principles & Constraints**

1.  **Living Architecture Document:** This `PLAN.md` is the single source of truth. All new features must be reflected here before implementation.

2.  **Learning and Personalization:** The agent must learn from user feedback. By analyzing which suggestions are accepted or dismissed, the system should adapt its behavior over time to provide more personalized and useful assistance.

3.  **Resource Efficiency:** Costly operations like LLM calls should be triggered by explicit user commands or after a cheaper, preliminary analysis indicates a high probability of a significant issue.

4.  **LLM-Led Workflow:** The LLM is responsible for planning and executing complex tasks by calling simple, single-purpose tools in sequence.

5.  **Agent Action System:** Specialized agents can propose `ui-action`s. Clicking them sends an `executeTool` command to the `OrchestratorAgent` for direct execution.

6.  **Polyglot & Extensible Environment:** The system is a universal programming partner.

7.  **Multilingual Support & Language Separation:** Conversational responses match the UI language, but code artifacts are in English.

8.  **Stability and Robustness:** All code must be production-quality.

9.  **Incremental & Phased Development:** Deliver the solution in logical, incremental phases.

10. **Rigorous Self-Correction:** Self-review code after generation.

11. **Architectural Purity:** Strictly follow **MAS, MCP, and A2A** patterns.

12. **Knowledge Request & Clarification:** **Never proceed based on assumption.**

13. **Upstream Sync Resilience:** Implement as a highly modular and isolated extension.

14. **Model Flexibility & Resilience:** Use an **OpenAI-compatible API** and support key rotation.


#### **System Architecture Overview**

The system is a **Multi-Agent System (MAS)**. A `CodeWatcherAgent` monitors file changes to trigger proactive analysis, and an `AILedLearningAgent` processes user feedback to enable personalization.

#### **Agent & Tool Roster**

**A. Agents (within the VSCode Extension):**

- `OrchestratorAgent`: The MCP Client, directs all user-facing workflows.
- `CodeWatcherAgent`: A background agent that observes file-save events and triggers analysis.
- `CodeAnalysisAgent`: Parses code, generates summaries, and builds the call graph.
- `ContextManagementAgent`: Selects relevant context for prompts.
- `RefactoringSuggestionAgent`: A specialized agent that handles refactoring.
- `DocumentationGenerationAgent`: A specialized agent for generating documentation.
- `SecurityAnalysisAgent`: A specialized agent that performs security checks.
- `AILedLearningAgent`: A specialized agent that processes user feedback (e.g., accepted/dismissed suggestions) to build a preference model, enabling other agents to provide more personalized support.


**B. Tools (exposed by the Local Tool Server):**

- `WebSearchTool`, `TerminalExecutionTool`, `FileReadTool`, `FileWriteTool`, `GitAutomationTool`, `SecurityVulnerabilityTool`, `PerformanceProfilingTool`, `ArchitectureGuardianTool`, `RealtimeDebuggingTool`.


#### **User Interface (UI) Components**

- **Main View:** A side panel with navigation between Chat and Settings.
- **Feedback Mechanism:** Actionable suggestions from agents (e.g., "Apply Refactoring") are accompanied by a "Dismiss" option, allowing the user to provide explicit feedback.
- **File Protection Toggle:** A UI switch to enable or disable the AI's ability to write to files.
- **Action Buttons:** Dynamically rendered buttons proposed by agents.
- **Settings Page:** For **Connectors** (MCP Server) and **LLM Configuration**.

</details>