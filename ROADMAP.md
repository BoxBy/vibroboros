# Vibroboros Project Roadmap

This document outlines the future direction and high-level goals for the Vibroboros project. Our vision is to create a truly autonomous and collaborative AI partner that seamlessly integrates into the entire software development lifecycle.

## v0.2.0 - Stability and Enhancement

**Theme:** Solidify the foundation and improve the performance and intelligence of the existing agent team.

-   **[ ] Agent Performance:**
    -   Refine the prompts and logic for all specialist agents to improve accuracy and reduce errors.
    -   Enhance the `AILedLearningAgent` to provide more granular feedback to other agents.
-   **[ ] Core Stability:**
    -   Improve error handling and reporting across the entire system.
    -   Add comprehensive unit and integration tests for all agents and services.
-   **[ ] UI/UX Polish:**
    -   Refine the user interface for a more intuitive and responsive experience.
    -   Improve the visualization of agent plans and progress.

## v0.5.0 - Deep Code Intelligence

**Theme:** Evolve beyond simple text parsing to a deep, structural understanding of code.

-   **[ ] AST-based Code Analysis:**
    -   **Upgrade `CodeAnalysisAgent`:** Replace the current regex-based symbol parser with a full Abstract Syntax Tree (AST) parser (e.g., using Tree-sitter).
    -   **Benefits:** This will enable a much deeper understanding of code, including variable scopes, type information, and complex control flows.
-   **[ ] Advanced Refactoring:**
    -   Leverage the new AST capabilities to enable more complex and context-aware refactorings (e.g., renaming a symbol across the entire project, extracting a method with correct dependency handling).
-   **[ ] Smarter Context Management:**
    -   Use the AST to provide the LLM with more precise context, such as the full call stack for a given function or the complete dependency graph for a class.

## v1.0.0 - The Distributed Agent System

**Theme:** Realize the full vision of Vibroboros by activating the dormant, future-ready A2A protocol.

-   **[ ] A2A Protocol Implementation:**
    -   **Activate `a2a_server.ts`:** Implement the server logic to allow agents to expose their capabilities over a network.
    -   **Activate `a2a_client.ts`:** Refactor the internal `dispatchA2AMessage` function to use the A2A client, enabling agents to communicate via HTTP.
-   **[ ] Agent Independence:**
    -   Transition each agent to run as its own independent process, potentially even on different machines.
    -   This will allow for a truly scalable and resilient system where agents can be updated, added, or removed without restarting the entire extension.
-   **[ ] Third-Party Agent Ecosystem:**
    -   Publish the A2A protocol specification to allow third-party developers to create their own agents that can seamlessly integrate with the Vibroboros ecosystem.

## Beyond 1.0.0 - The Future

-   **[ ] Collaborative Agents:** Enable multiple instances of Vibroboros (run by different developers) to collaborate on the same codebase.
-   **[ ] Self-Healing Code:** Design an agent that can not only detect bugs but also autonomously write and test a fix.
-   **[ ] Full Project Scaffolding:** Create a `ProjectScaffoldingAgent` that can generate a complete, production-ready project structure based on a high-level description.
