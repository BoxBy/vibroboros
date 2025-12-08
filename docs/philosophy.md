# 🧬 Our Philosophy: The Viper Principle

Our name, **Viper**, is a portmanteau of "Vibe Coding" and "Ouroboros," which together encapsulate our core philosophy.

-   **Vibe Coding** is a new paradigm of development. It refers to the process where a developer, aided by a generative AI, writes code based on intuition and high-level goals, rather than strict, pre-defined specifications. It's a fluid, collaborative dance between human creativity and AI execution.

-   **Ouroboros**, the ancient symbol of a serpent eating its own tail, represents the ultimate goal of this project: to create a system that can perfectly regenerate itself.

The **Viper Principle** is the fusion of these two ideas. The entire codebase was bootstrapped from a set of high-level prompts (the "Vibe"). The final test is to feed those same prompts back into the finished product (the "Ouroboros" loop) and have it produce a perfect, 1:1 copy of itself, infinitely. It is a project that continuously rebuilds itself from the very prompts that created it.

We've also intentionally designed Viper with a dual architecture to serve two critical purposes: immediate performance and future scalability.

1.  **Current Implementation (In-Process):** For maximum speed and efficiency, the system currently runs as a VS Code extension with an in-process MCP tool server and a local HTTP A2A server. The `OrchestratorAgent` lives inside the extension host, uses the MCP SDK to call local tools, and talks to specialist agents hosted by `a2a_server.ts` over HTTP using the `@a2a-js/sdk`.

2.  **Future-Ready (Distributed A2A):** The same A2A protocol and MCP tooling are designed to extend beyond the local machine. Over time, agents will be able to run as independent services (potentially on other hosts or platforms), and third-party agents will join the ecosystem via standard A2A cards and HTTP endpoints.
