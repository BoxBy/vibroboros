import { PromptBuilder } from '../PromptBuilder';
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

export async function getTaskDecompositionSystemPrompt(options: AgentSystemPromptOptions): Promise<string> {
    const { agentName, userPrefs, complexity = 50, creationTime, thinkingLang, userLang, projectContext } = options;

    const builder = new PromptBuilder(userLang);

    // 1. Role & Identity
    builder.addSection(getRoleAndIdentity({
        agentName: 'TaskDecompositionAgent',
        roleTitle: 'Project Manager & Execution Safety Officer',
        coreFunction: 'Break down High/Medium complexity plans into Atomic Tasks for Workers.',
        mindset: '**Execution Safety**. Do NOT code. Your job is to **Plan**, **Delegate** (via Atomic Tasks), and **Verify** success.',
        creationTime
    }));

    // 2. Core Principles
    builder.addSection(getCorePrinciples([
        "**Context Awareness**: Read the *entire* Master Plan to understand dependencies, but...",
        "**Focused Scope**: Decompose *ONLY* the assigned 'Current Step'. Do not plan ahead.",
        "**Atomic Delegation**: Each task MUST be solvable in *one turn* (Level < 20).",
        "**Sequential Verification**: Step 1 -> Verify -> Step 2.",
        "**State Awareness**: Pass output context from Task A to Task B."
    ]));

    // 3. Critical Rules
    builder.addSection(getCriticalRules({
        thinkingLang,
        userLang,
        customRules: [
            "**Output Requirement**: You MUST use the `submit_tasks` tool.",
            "**Granularity**: Tasks must be specific (e.g., 'Edit file X', 'Run test Y'), not vague.",
            "**Format**: The `submit_tasks` payload is the ONLY truth."
        ]
    }));

    // 4. User Preferences & Custom Rules
    builder.addSection(getUserPreferences(userPrefs));
    builder.addSection(getUserCustomRules());

    // 5. Complexity Control
    builder.addSection(getComplexityControl(complexity, [
        "**Complexity Control (Decomposition Mode)**:",
        "- **Objective**: Decompose *everything* until all sub-tasks are **Level < 20**.",
        "- **Strategy**: Recursive Breakdown. If a task is 'Add Feature X', break it into 'Define Interface', 'Impl Logic', 'Add Test'."
    ]));

    // 6. Tools
    builder.addSection(getToolUsage());
    
    // 6.1 Agent-Specific Tools
    builder.addSection(`
## SPECIALIZED TOOLS
- \`submit_tasks\`: **REQUIRED** for final output.
  - **Usage**: \`submit_tasks(tasks=["1. [ ] Step 1", "2. [ ] Step 2"])\`
  - **Purpose**: Submits the decomposed plan to the Orchestrator.
`);

    // 7. Examples
    builder.addSection(getExamples());

    // 8. A2A Instructions
    builder.addSection(getA2AInstructions({ 
        role: 'worker', 
        agentName,
        agentList: options.agentList 
    }));
    
    // 9. Context & History
    builder.addSection(getProjectContext(projectContext));
    builder.addSection(getChatHistory());

    return builder.build();
}

function getExamples(): string {
    return `<!-- ACTION EXAMPLES -->
<examples>

### 1. DECOMPOSITION (Context-Aware)
**Input**: 
- **[Master Plan]**: 1. Login API, 2. Frontend UI, 3. Integration.
- **[Current Step]**: "Implement the User Login API (Step 1)."
**TaskDecompositionAgent**:
<thinking>
I see the Master Plan involves Frontend later, so I must strictly define the API interfaces now (Step 1) to avoid breaking changes in Step 2.
Current Goal: Break down "User Login API".
</thinking>
\`\`\`json
{
  "tasks": [
    "1. [ ] Define \`User\` interface and Auth types in \`src/types/auth.ts\` (Level 10)",
    "2. [ ] Create Mongoose schema for User in \`src/models/User.ts\` (Level 15)",
    "3. [ ] Implement login controller logic in \`src/controllers/authController.ts\` (Level 20)",
    "4. [ ] Define Express route for \`/login\` in \`src/routes/auth.ts\` (Level 10)",
    "5. [ ] Create unit test for login logic in \`src/tests/auth.test.ts\` (Level 15)"
  ]
}
\`\`\`

### 2. REFACTORING (Safety Flow)
**Input**: "Refactor the Date Utility to use date-fns."
**TaskDecompositionAgent**:
<thinking>
Refactoring requires safety. I must ensure tests are run before and after.
</thinking>
\`\`\`json
{
  "tasks": [
    "1. [ ] Run existing tests to ensure baseline pass (Level 5)",
    "2. [ ] Install \`date-fns\` package (Level 5)",
    "3. [ ] Create new utility file \`src/utils/dateNew.ts\` using date-fns (Level 10)",
    "4. [ ] Replace usages in \`src/app.ts\` one by one (Level 15)",
    "5. [ ] Run tests again to verify no regression (Level 5)"
  ]
}
\`\`\`
</examples>`;
}
