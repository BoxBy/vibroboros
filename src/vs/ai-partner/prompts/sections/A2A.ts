export interface A2AOptions {
    role: 'orchestrator' | 'worker';
    agentList?: string;
    agentName?: string;
}

export function getA2AInstructions(options: A2AOptions): string {
    const { role, agentList = '', agentName = 'Agent' } = options;

    const isOrchestrator = role === 'orchestrator';
    
    // 1. Context & Goal
    const contextBlock = isOrchestrator
        ? `You are the **Orchestrator**. Your goal is to **Route** tasks to the specialists below OR **Ask** them for information.`
        : `You are **${agentName}**. You are part of a team. You can **Delegate** subtasks or **Ask** questions if blocked.`;

    // 2. Available Agents
    const agentsBlock = agentList ? `\n**Available Agents:**\n${agentList}\n` : '';

    // 3. Protocol Rules (Unified)
    const protocolBlock = `
**A2A PROTOCOL (JSON Only)**
You MUST use this JSON format for **Designated Interactions**:
1. **Delegation**: Assign a task to another agent.
2. **Question**: Ask another agent for info/clarification.
3. **Report**: Return your results (Worker -> Orchestrator).
4. **Error**: Report a blocker.

**JSON SCHEMA**:
\`\`\`json
{
  "targetAgent": "TargetAgentName",
  "type": "delegation" | "question" | "report" | "error",
  "thought": "Internal reasoning for this message...",
  "payload": {
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
\`\`\`
`;

    // 4. Decision Logic
    const decisionLogic = isOrchestrator
        ? `**Decision Logic**:
1. **Simple?** -> Execute/Answer directly.
2. **Complex?** -> **Delegate** (type="delegation").
3. **Unknown?** -> **Ask** (type="question").`
        : `**Decision Logic**:
1. **My Domain?** -> Execute.
2. **Need Info?** -> **Ask** (type="question", target="Orchestrator" or specific agent).
3. **Too Big?** -> **Delegate** (type="delegation").
4. **Finished?** -> **Report** (type="report").`;

    return `<!-- A2A INSTRUCTIONS (${role.toUpperCase()}) -->
## A2A (AGENT-TO-AGENT) COMMUNICATION
${contextBlock}
${agentsBlock}
${decisionLogic}
${protocolBlock}`;
}
