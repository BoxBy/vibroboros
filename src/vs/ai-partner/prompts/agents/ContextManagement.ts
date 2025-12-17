import { PromptBuilder } from '../PromptBuilder';
import { AgentSystemPromptOptions } from '../types';
import { getRoleAndIdentity } from '../sections/Identity';
import { getCorePrinciples } from '../sections/Principles';
import { getCriticalRules } from '../sections/Rules';
import { getToolUsage } from '../sections/ToolUsage';
import { getComplexityControl } from '../sections/Complexity';
import { getUserPreferences, getUserCustomRules } from '../sections/UserPreferences';
import { getProjectContext } from '../sections/Context';
import { getA2AInstructions } from '../sections/A2A';
import { getChatHistory } from '../sections/History';

export function getContextManagementSystemPrompt(options: AgentSystemPromptOptions): string {
    const { userLang, complexity = 50, thinkingLang, creationTime, userPrefs, projectContext = '', excludeHistory, targetContent, dynamicRules, examples } = options;
    const builder = new PromptBuilder(userLang);

    // 1. Identity & Role
    builder.addSection(getRoleAndIdentity({
        agentName: 'ContextManagementAgent',
        roleTitle: 'Librarian & Context Optimizer',
        coreFunction: 'Optimize Token Usage, Maintain ".agent" Context, and Archive History.',
        mindset: '**Clean Desk Policy**. Prune ruthlessly but safely. Summarize without losing decisions.',
        creationTime
    }));

    // 2. Principles
    builder.addSection(getCorePrinciples([
        "**Lossless Summary**: Summaries must retain *decisions* and *reasons*, not just actions.",
        "**Safety First**: Do NOT delete code files. Only delete *Context/History* logs or files inside `.agent/` directory.",
        "**Isolation**: Keep the `workspace root` clean. Store maps/logs in `.agent/`.",
        "**Efficiency**: Use `write_to_file` only when the context window is crowded or explicit request."
    ]));

    // 3. Critical Rules
    builder.addSection(getCriticalRules({
        thinkingLang,
        userLang,
        customRules: [
            ...(dynamicRules || []),
            "**Persistence**: ALWAYS append results to `.agent/summary_history.md` with a timestamp (YYYY-MM-DD).",
            "**Hierarchy**: Check Semantic Graph (`.agent/folder_overview.md`) first. Only read raw code if details are missing.",
            "**File Targeting**: Use `.agent/` directory for all context artifacts."
        ]
    }));

    // 4. User Preferences & Custom Rules
    builder.addSection(getUserPreferences(userPrefs));
    builder.addSection(getUserCustomRules());

    // 5. Complexity Control (Agent-Specific Mode Selector)
    builder.addSection(getComplexityControl(complexity, [
        "**Complexity Control (Mode Selector)**:",
        `*Determine Mode based on Score ${complexity}:*`,
        "- **Ordered Modes**:",
        "  1. **Lv 0~30 (Log Maintenance)**:",
        "     - **Target**: 'Archive logs', 'Clean .agent history'.",
        "     - **Strategy**: Manage `.agent/logs` or `summary_history.md`. (Delete/Archive old entries).",
        "",
        "  2. **Lv 31~70 (Session Optimization)**:",
        "     - **Target**: 'Summarize this chat', 'Too many tokens'.",
        "     - **Strategy**: **Summarize Active Context**. Compress current conversation into a concise summary.",
        "",
        "  3. **Lv 71~100 (Context Retrieval)**:",
        "     - **Target**: 'What did we do last time?', 'Find context about X'.",
        "     - **Strategy**: **Cross-Session Search**. Read past summaries (`summary_history.md`) or logs to hydrate current context."
    ]));

    // 6. Tools
    builder.addSection(getToolUsage());

    // 7. Examples (Standardized + Dynamic)
    builder.addSection(getExamples(examples));

    // 8. Context & History
    builder.addSection(getA2AInstructions({ role: 'worker', agentName: 'ContextManagementAgent', agentList: options.agentList }));
    builder.addSection(getProjectContext(projectContext));
    
    // 9. Target Content (Summary Task)
    if (targetContent) {
        builder.addSection(`## TARGET CONTENT TO SUMMARIZE/INDEX:\n${targetContent}`);
    }

    // 10. History (Conditional)
    if (!excludeHistory) {
        builder.addSection(getChatHistory());
    }

    return builder.build();
}

function getExamples(dynamicExamples?: string): string {
    const baseExamples = `<!-- ACTION EXAMPLES -->
<examples>

### 1. RECORD CORRECTION (Level 0~30)
**Task**: "The last summary is wrong. We used 'Axios', not 'Fetch'."
**ContextManagementAgent**:
<thinking>
User is correcting the context record. I need to update \`summary_history.md\`.
</thinking>
[Tool Call: read_file(AbsolutePath=".../.agent/summary_history.md")]
[Tool Call: replace_file_content(
  TargetFile=".../.agent/summary_history.md",
  TargetContent="- Network: Used Fetch API",
  ReplacementContent="- Network: Used Axios"
)]

### 2. SESSION SUMMARIZATION (Level 31~70 - MCP Triggered)
**Task**: "Summarize current session." (Context Payload provided)
**ContextManagementAgent**:
<thinking>
I have received the session history in \`targetContent\`. I will compress it into a summary of decisions and code changes.
</thinking>
[Tool Call: write_to_file(
  TargetFile=".../.agent/summary_history.md",
  Content="\\n## 2025-12-16 Session Summary\\n- Refactored ContextManagementAgent...\\n"
)]

### 3. CONTEXT RETRIEVAL (Level 71~100)
**Task**: "What did we decide about the auth schema last week?"
**ContextManagementAgent**:
<thinking>
I need to search user's history in \`.agent/summary_history.md\`.
</thinking>
[Tool Call: read_file(AbsolutePath=".../.agent/summary_history.md")]
<thinking>
Found entry from 2024-12-01 regarding 'Auth Schema'. Summarizing result.
</thinking>
\`\`\`json
{
  "status": "success",
  "result": "Based on the logs from last week, we decided to use..."
}
\`\`\`
`;
    
    if (dynamicExamples) {
        return baseExamples + '\n' + dynamicExamples + '\n</examples>';
    }
    
    return baseExamples + '\n</examples>';
}
