#### This repository was developed leveraging Gemini.

---

### [English](README.md) | [한국어](README_ko.md)

---
<div align="center">
  <img src="./media/logo.svg" alt="Vibroboros Logo" width="200"/>
  <h1>Vibroboros</h1>
  <p><strong>An autonomous, multi-agent AI coding partner for Visual Studio Code.</strong></p>

  <p>
    <a href="https://github.com/your-repo/vibroboros/actions"><img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build Status"></a>
    <a href="https://github.com/your-repo/vibroboros/releases"><img src="https://img.shields.io/badge/version-0.1.0-blue" alt="Version"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
    <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
  </p>
</div>

Vibroboros is our vision for the future of software development: a sophisticated system of specialized AI agents that collaborate as a team, right inside your IDE. We designed it to understand complex, high-level requests, formulate a detailed execution plan, and then carry out that plan using a suite of developer tools. **It even documents its own progress.**

---

## 🧬 Our Philosophy: The Vibroboros Principle

Our name, **Vibroboros**, is a portmanteau of "Vibe Coding" and "Ouroboros," which together encapsulate our core philosophy.

-   **Vibe Coding** is a new paradigm of development. It refers to the process where a developer, aided by a generative AI, writes code based on intuition and high-level goals, rather than strict, pre-defined specifications. It's a fluid, collaborative dance between human creativity and AI execution.

-   **Ouroboros**, the ancient symbol of a serpent eating its own tail, represents the ultimate goal of this project: to create a system that can perfectly regenerate itself.

The **Vibroboros Principle** is the fusion of these two ideas. The entire codebase was bootstrapped from a set of high-level prompts (the "Vibe"). The final test is to feed those same prompts back into the finished product (the "Ouroboros" loop) and have it produce a perfect, 1:1 copy of itself, infinitely. It is a project that continuously rebuilds itself from the very prompts that created it.

We've also intentionally designed Vibroboros with a dual architecture to serve two critical purposes: immediate performance and future scalability.

1.  **Current Implementation (In-Process):** For maximum speed and efficiency, the system currently runs as a tightly-coupled group of agents within a single VS Code extension process. Communication is handled by a simple, in-memory `dispatchA2AMessage` function.

2.  **Future-Ready (A2A Protocol):** We've also laid the groundwork for a far more advanced, decoupled architecture with the `a2a_server.ts`, `a2a_client.ts`, and `core_data_structures.ts` files. This design will allow agents to run as independent HTTP servers, communicating via a standardized, task-based Agent-to-Agent (A2A) protocol.

---

## ✨ Core Features

-   **🤖 Dynamic Task Planning & Execution:**
    -   **Goal-Oriented:** Give Vibroboros a high-level goal (e.g., "*Refactor this class to be more performant and add documentation*").
    -   **Automated Planning:** It uses an LLM to break down your goal into a logical, step-by-step execution plan.
    -   **Autonomous Operation:** Engage **Autonomous Mode** to let the agent execute the entire plan without needing your approval for each step.

-   **✍️ Autonomous Documentation:**
    -   After completing a significant task, Vibroboros **automatically updates its own `README.md`**.
    -   It reads project files like `PLAN.md` and `PROGRESS.md` to generate a comprehensive and up-to-date overview of the project's status.

-   **🛠️ Full-Fledged Developer Toolset:**
    -   We built a local **MCP (Model-Capability-Provider) Server** to give our agents the tools they need to *actually* code.
    -   **Tools include:** File Read/Write, Terminal Execution, Web Search, and Git Automation.

-   **🧠 Advanced Context & Long-Term Memory:**
    -   **Codebase Indexing:** The `CodeAnalysisAgent` builds a symbol index of your entire workspace for fast context retrieval.
    -   **Persistent Memory:** The `ContextArchiveAgent` saves important details from conversations to disk, giving Vibroboros a long-term memory across sessions.

-   **🚀 Proactive & Background Assistance:**
    -   The `CodeWatcherAgent` works silently in the background, triggering security scans and code analysis on every file save.

-   **🧑‍🏫 Learns From Your Feedback:**
    -   The `AILedLearningAgent` tracks your feedback on suggestions to build a user preference model, allowing other agents to tailor their suggestions to your coding style.

## ⚙️ Our Architecture

We designed Vibroboros with a multi-agent architecture to promote separation of concerns, making the system robust and extensible. This diagram illustrates the flow of control in our system.

```mermaid
graph TD
    subgraph "VS Code UI (Webview)"
        UI[MainView.tsx]
    end

    subgraph "Vibroboros Extension"
        Orchestrator[👑 OrchestratorAgent]
        MCP[🛠️ MCPServer]
        A2ADispatch[A2A Dispatch]

        subgraph "Specialist Agents"
            Refactor[✨ RefactoringAgent]
            Docs[📝 DocumentationAgent]
            Test[🧪 TestGenerationAgent]
            Security[🛡️ SecurityAnalysisAgent]
            Watcher[👁️ CodeWatcherAgent]
            Context[📚 ContextManagementAgent]
            Analysis[🔍 CodeAnalysisAgent]
            Memory[💾 ContextArchiveAgent]
            Learning[🧑‍🏫 AILedLearningAgent]
            Readme[✍️ ReadmeGenerationAgent]  // Added
        end

        subgraph "Tools"
            FS[File I/O]
            Term[Terminal]
            Web[Web Search]
        end
    end

    UI -- User Input --> Orchestrator
    Orchestrator -- Renders State --> UI

    Orchestrator -- Creates Plan & Delegates --> A2ADispatch
    Orchestrator -- On Plan Completion --> A2ADispatch
    A2ADispatch -- Task --> Readme // New Flow

    A2ADispatch -- Task --> Refactor
    A2ADispatch -- Task --> Docs
    A2ADispatch -- Task --> Test
    A2ADispatch -- Task --> Security
    A2ADispatch -- Task --> Context
    A2ADispatch -- Task --> Analysis
    A2ADispatch -- Task --> Memory
    A2ADispatch -- Task --> Learning

    Watcher -- Triggers on Save --> A2ADispatch

    Refactor -- Uses Tool --> MCP
    Docs -- Uses Tool --> MCP
    Test -- Uses Tool --> MCP
    Security -- Uses Tool --> MCP
    Readme -- Uses Tool --> MCP // New Flow

    MCP -- Executes --> FS
    MCP -- Executes --> Term
    MCP -- Executes --> Web

    subgraph "External Services"
        LLM[LLM API]
    end

    Orchestrator -- API Calls --> LLM
    Refactor -- API Calls --> LLM
    Docs -- API Calls --> LLM
    Test -- API Calls --> LLM
    Readme -- API Calls --> LLM // New Flow
```

## 🤖 Meet the Agents

The power of Vibroboros comes from its team of specialized agents. We've assembled this team so that each agent has a specific role, allowing the system to handle complex tasks with precision.

| Agent | Role | Key Responsibilities |
| :--- | :--- | :--- |
| 👑 **`OrchestratorAgent`** | **The Conductor** | Manages the entire workflow, creates plans, delegates tasks, and triggers README updates. |
| ✍️ **`ReadmeGenerationAgent`** | **The Documentarian** | Autonomously generates and updates the project's README.md file after major tasks are completed. |
| 📚 **`ContextManagementAgent`** | **The Librarian** | Gathers and prepares all necessary context (active file, codebase search results) for a given task. |
| 🔍 **`CodeAnalysisAgent`** | **The Cartographer** | Builds and maintains a symbol index of the entire workspace for fast and relevant code lookups. |
| ✨ **`RefactoringSuggestionAgent`**| **The Artisan** | Analyzes code and suggests improvements and refactorings based on best practices and user preferences. |
| 📝 **`DocumentationGenerationAgent`**| **The Scribe** | Generates documentation (e.g., JSDoc, Python docstrings) for specific functions, classes, and methods. |
| 🧪 **`TestGenerationAgent`** | **The Quality Engineer** | Writes unit tests for your code using the appropriate testing framework for the language. |
| 🛡️ **`SecurityAnalysisAgent`** | **The Guard** | Performs fast, local security scans for common vulnerabilities using regex-based patterns. |
| 🧠 **`AILedLearningAgent`** | **The Mentor** | Tracks user feedback on suggestions to create a preference model that personalizes the AI's behavior. |
| 💾 **`ContextArchiveAgent`** | **The Historian** | Provides the system with long-term memory by saving and retrieving key information across sessions. |
| 👁️ **`CodeWatcherAgent`** | **The Sentinel** | Runs in the background, watching for file changes to trigger proactive tasks like security scans and re-indexing. |

## 🚀 Getting Started

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-repo/vibroboros.git
    cd vibroboros
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Run the extension**:
    -   Open the project folder in VS Code.
    -   Press `F5` to launch the "Extension Development Host" window.

## ⚙️ Configuration

To customize Vibroboros, open the VS Code Settings (`Ctrl+,` or `Cmd+,`) and search for "Vibroboros".

| Setting | Description | Default Value |
| :--- | :--- | :--- |
| `vibroboros.llm.apiKeys` | Your API key(s) for the LLM provider. | `[]` |
| `vibroboros.llm.endpoint` | The base URL for the OpenAI-compatible API. | `''` |
| `vibroboros.agent.{agentName}.model` | Allows specifying a different model for a particular agent (e.g., a faster model for simple tasks). | `gpt-4` |
| `vibroboros.agent.orchestrator.contextTokenThreshold` | The number of tokens at which the conversation history will be automatically summarized. | `100000` |

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

Please read our `CONTRIBUTING.md` file for guidelines on how to contribute.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
