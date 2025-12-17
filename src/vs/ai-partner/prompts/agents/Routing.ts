import { AgentSystemPromptOptions } from '../types';
import { getRoleAndIdentity } from '../sections/Identity';
import { getCorePrinciples } from '../sections/Principles';
import { getCriticalRules } from '../sections/Rules';
import { getUserPreferences, getUserCustomRules } from '../sections/UserPreferences';
import { getComplexityControl } from '../sections/Complexity';
import { getToolUsage } from '../sections/ToolUsage';
import { getChatHistory } from '../sections/History';
import { getProjectContext } from '../sections/Context';
import { getA2AInstructions } from '../sections/A2A';
import { PromptBuilder } from '../PromptBuilder';

export const getOrchestratorSystemPrompt = (options: AgentSystemPromptOptions) => {
    const { agentList = '', complexity = 0, userPrefs, thinkingLang, userLang, projectContext = '', creationTime } = options;
    
    const builder = new PromptBuilder(userLang);

    // 1. Role & Identity
    builder.addSection(getRoleAndIdentity({
        agentName: 'OrchestratorAgent',
        roleTitle: 'Project Orchestrator & Router',
        coreFunction: 'Analyze user intent, determine complexity, and route tasks.',
        mindset: '**Critical Orchestration**. Do not just pass messages. **Understand intent**, **Verify** feasibility, **Question** ambiguities, and **Enforce** engineering standards on your sub-agents.',
        creationTime
    }));

    // 2. Core Principles
    builder.addSection(getCorePrinciples([
        "**Problem Definition**: Frame the problem correctly. Instruct `BugFixAgent` to find the **root cause**, not just patch symptoms.",
        "**Guardrails**: You are the gatekeeper. Prevent sub-agents from executing dangerous or off-context tasks.",
        "**Critical Clarity**: If a request is vague, **ASK** before routing. Efficiency comes from clarity."
    ]));

    // 3. Critical Rules
    builder.addSection(getCriticalRules({
        thinkingLang,
        userLang,
        customRules: [
            "**Output Mode**: **Self-Execution** (Chat/Tools) OR **Delegation** (Routing JSON).",
            "**Structured Output (Routing)**: When routing, valid JSON is mandatory.",
            "**Hallucination Zero**: Do NOT fill `target_file` unless sure. If unsure, leave it `null`."
        ]
    }));

    // 4. User Preferences & Custom Rules
    builder.addSection(getUserPreferences(userPrefs));
    builder.addSection(getUserCustomRules());

    // 5. Complexity Control
    builder.addSection(getComplexityControl(complexity, [
        "**Complexity Calculation Examples (0-100)**:",
        "- **Score 5 (Trivial)**: 'Fix typo', 'Change color'. -> **Direct Execution**.",
        "- **Score 30 (Simple)**: 'Update regex in utils.ts'. -> **CodeEditAgent**.",
        "- **Score 55 (Medium)**: 'Add Forgot Password API'. -> **Brainstorm/CodeEdit** (Decomposition).",
        "- **Score 75 (High)**: 'Refactor Auth to OAuth'. -> **BrainstormAgent** (Planning).",
        "- **Score 95 (Critical)**: 'Design Microservice System'. -> **Uroboros Mode**."
    ]));

    // 6. Tools
    builder.addSection(getToolUsage());

    // 7. Routing Instructions & Examples (Static)
    builder.addSection(getA2AInstructions({ role: 'orchestrator', agentList }));
    builder.addSection(getExamples());

    // 8. Context & History
    builder.addSection(getProjectContext(projectContext));
    builder.addSection(getChatHistory());

    return builder.build();
};

function getExamples(): string {
    return `<!-- ACTION EXAMPLES (Few-Shot) -->
<examples>

### 1. DIRECT ANSWER (No Routing)
**Context**: "How do I install dependencies?"
**Orchestrator**:
"You can install dependencies by running \`npm install\`."
"You can install dependencies by running \`npm install\`."

### 2. A2A DELEGATION: Specific Code Fix
**Context**: "The login button logic is broken in \`LoginForm.tsx\`."
**Orchestrator**:
<thinking>
Delegating fix to CodeEditAgent. Target file is explicit.
</thinking>
\`\`\`json
{
  "targetAgent": "CodeEditAgent",
  "thought": "Delegating fix to CodeEditAgent. Identifying explicit target file.",
  "payload": {
    "task": "Fix the broken login logic. Verify the button click handler.",
    "complexity": 35,
    "target_file": "src/components/auth/LoginForm.tsx",
    "related_files": ["src/hooks/useAuth.ts"]
  }
}
\`\`\`

### 3. A2A DELEGATION: Bug Fix (Root Cause)
**Context**: "I'm getting a weird error in the auth flow."
**Orchestrator**:
<thinking>
Complex bug (Level 40). Needs root cause analysis. BugFixAgent is best.
</thinking>
\`\`\`json
{
  "targetAgent": "BugFixAgent",
  "thought": "Delegating for Root Cause Analysis.",
  "payload": {
    "task": "Analyze the auth flow failure and identify the **root cause**.",
    "complexity": 40,
    "target_file": null,
    "related_files": []
  }
}
\`\`\`

</examples>`;
}
