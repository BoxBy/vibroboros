export interface A2AOptions {
    role: 'orchestrator' | 'worker';
    agentList?: string[] | string;
    agentDescriptions?: string;
    agentName?: string;
    cwd?: string;
}

export function getA2AInstructions(options: A2AOptions): string {
    const { role, agentList = [], agentDescriptions = '', agentName = 'Agent' } = options;

    const isOrchestrator = role === 'orchestrator';
    
    // 1. Context & Goal
    const cwdBlock = options.cwd ? `**Current Working Directory (Workspace Root)**: \`${options.cwd}\`\n\n` : '';
    const contextBlock = isOrchestrator
        ? `You are the **Orchestrator**. Your goal is to **Route** tasks to the specialists below OR **Ask** them for information.`
        : `You are **${agentName}**. You are part of a team. You can **Delegate** subtasks or **Ask** questions if blocked.`;

    // 2. Available Agents
    let agentsBlock = '';
    if (agentDescriptions) {
        agentsBlock = `\n**Available Team Members:**\n${agentDescriptions}\n`;
    } else if (agentList) {
        const listStr = Array.isArray(agentList) ? agentList.join(', ') : agentList;
        agentsBlock = listStr ? `\n**Available Agents:**\n${listStr}\n` : '';
    }

    // 3. Protocol Rules (Unified)
    const protocolBlock = `
**A2A PROTOCOL (JSON Only)**
You MUST use this JSON format for **Designated Interactions**:
1. **Delegation**: Assign a task to another agent.
2. **Question**: Ask another agent for info/clarification.
3. **Report**: Return your results (Worker -> Orchestrator).
4. **Error**: Report a blocker.

**JSON SCHEMA**:
{
  "targetAgent": "ExactNameFromAvailableList" | "None", // MUST be from the list above if delegating. Use "None" ONLY for direct persona-to-user chat.
  "type": "delegation" | "question" | "report" | "error",
  "thought": "Internal reasoning for this message...",
  "payload": {
      // MANDATORY: Use payload.message for all user-facing content (reports, plans, questions).
      // FORMATTING: Use proper markdown with double newlines (\n\n) for readability. 
      // If you are proposing a new file, you MUST include a markdown code block with the filename as a comment.
      "message": "User-facing reply with markdown support...",
      // FOR DELEGATION:
      "task": "Clear instructions...",
      "context": "Background info...",
      "target_file": "path/to/main_file" | null,
      "related_files": ["path/to/related1", "path/to/related2"],
      "complexity": 50, // 0-100 (Est.)

      // FOR QUESTION:
      "question": "What is the schema for...?",

      // FOR REPORT:
      "status": "success" | "failure",
      "result": "Summary of work done...",
      "correlation": { ... } // Echo back if received
  }
}
`;

    // 4. Decision Logic (Unified 4-Step Standard)
    const decisionLogic = `**CORE REASONING STEPS (Strictly follow in <thinking> block):**
1. **Analysis**: [Intent: Why am I here?]. [Assessment: Technical strategy]. [Self-Complexity (0-100): My honest evaluation].
2. **Verification**: [Knowledge Gap: Critical check of Knowledge Cutoff (Oct 2023) vs Required Stack versions/features]. [Complexity Discrepancy: Assigned vs Self]. [Questioning: Specific blockers or missing context].
3. **Self-Correction**: [Criticism: What's wrong with my first thought?]. [Correction: How do I fix it?]. [Refinement: Final polish on strategy].
4. **Plan**: [Final Action Sequence: Precise tool calls].`;

    // 5. Shared Handover Example (Worker Only)
    const workerExample = !isOrchestrator ? `
**EXAMPLE: HANDOVER (Complexity Discrepancy Detected)**
**System Context**: { "task": "Migrate Auth to Microservices", "complexity": 45, "target_file": "src/auth/AuthController.ts" }
**Agent**:
<thinking>
1. **Analysis**: 
   - [Intent]: Transition legacy monolithic auth logic to a modern microservice architecture.
   - [Assessment]: Implementation involves decoupling session management, setting up a shared Redis store, and updating JWT validation logic across multiple services.
   - [Self-Complexity (0-100)]: Lv 85.
2. **Verification**: 
   - [Knowledge Gap]: **Detailed Check**. Current Date: 2025-12-22. Knowledge Cutoff: 2023-10-01. I have full knowledge of OAuth2/OIDC and JWT standards. However, if the project uses 'AuthFramework v7' (released 2024), I have a **Critical Gap** regarding its specific API changes and must use \`web_search\` or \`read_file\`. For this task, assuming standard Node.js patterns, the gap is **Minimal**.
   - [Complexity Discrepancy]: Assigned 45 vs Self 85. Underestimation detected. Decoupling critical auth logic carries significant architectural and security risk.
   - [Questioning]: Is there an existing service discovery mechanism I should integrate with?
3. **Self-Correction**: 
   - [Criticism]: My worker limit is Lv 50. Proceeding with a Lv 85 task will likely lead to architectural debt or security vulnerabilities.
   - [Correction]: Reject current task. Request a high-level orchestration plan from BrainstormAgent.
   - [Refinement]: Ensure the handoff report explicitly mentions the Redis dependency and the Lv 85 complexity.
4. **Plan**: Send 'delegation' to BrainstormAgent.
</thinking>
{
  "targetAgent": "BrainstormAgent",
  "type": "delegation",
  "thought": "Handover: Complexity Discrepancy (Assigned 45 -> Actual 85). Exceeds Worker Limit (50). Requesting high-level design.",
  "payload": {
      "task": "Migrate Auth to Microservices",
      "complexity": 85,
      "target_file": "src/auth/AuthController.ts",
      "related_files": []
  }
}
` : '';

    return `## A2A (AGENT-TO-AGENT) COMMUNICATION
${cwdBlock}${contextBlock}
${agentsBlock}
${decisionLogic}
${protocolBlock}
${workerExample}`;
}
