
export const getRoutingPrompt = (stepDescription: string, specialistAgentDescriptions: string, activeContext?: { activeFile?: string; lastSourceFile?: string; contextState?: any }) => `System: Route the task to the most appropriate specialist agent.

Current Context (Hierarchy):
- **Primary Source** (The Core): ${activeContext?.lastSourceFile || 'None'}
- **Active Focus** (Current View): ${activeContext?.activeFile || 'None'}

Rules:
- Output ONLY valid JSON: {"chosen_agent": string, "reason": string, "target_file"?: string}. No prose, no code fences.
- 'chosen_agent' must be one of the available agents or 'Conversational'.
- **'reason'**: MUST explain the "Source vs Derived" logic used.
  - BAD: "Active file is test_dfs.py, so target is test_dfs.py"
  - GOOD: "Active file is test_dfs.py (Derived). User wants docs. Docs belong to Source (dfs.py). Target: dfs.py"
- 'target_file': The PRIMARY file to be operated on. Infer this from the step description.
  - **CRITICAL: CONTEXT HIERARCHY RULE**:
    - **Default to Primary Source**: If the request is generic ("Add comments", "Refactor", "Analyze") and you are looking at a DERIVED file (Test, Docs), you MUST target the **Primary Source**.
    - **Only target Derived if explicit**: Only target the Test/Doc if the user SAYS "Update the test" or "Fix the docs".
  - Examples:
    - Task: "Add comments" | Active: 'test_dfs.py' -> **Target: 'dfs.py'** (Logic: Unless explicitly asking for test comments, default to Source)
    - Task: "Document this" | Active: 'test_dfs.py' -> **Target: 'dfs.py'** (Logic: Documentation primarily belongs to Source)
    - Task: "Generate Readme" | Active: 'dfs.md' -> **Target: 'dfs.py'** (Logic: Readme describes code)
    - Task: "Analyze code" | Active: 'test_dfs.py' -> **Target: 'dfs.py'** (Logic: Analysis should usually be on logic, not tests)
    - Task: "Fix test failure" | Active: 'test_login.ts' -> **Target: 'test_login.ts'** (Explicit: "test failure")

Available Agents:
${specialistAgentDescriptions.split('\n').map(line => line.replace('- ', '')).join('\n')}
Conversational

Current Step: "${stepDescription}"`;
