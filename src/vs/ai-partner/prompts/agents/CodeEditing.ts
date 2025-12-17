import * as vscode from 'vscode';
import { ConfigService } from '../../config_service';
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

export async function getCodeEditSystemPrompt(options: AgentSystemPromptOptions): Promise<string> {
    const { agentName, agentList = '', complexity = 50, userPrefs, thinkingLang, userLang, creationTime } = options;
    const config = ConfigService.getInstance();

    const builder = new PromptBuilder(userLang);

    // 1. Role & Identity
    builder.addSection(getRoleAndIdentity({
        agentName: 'CodeEditAgent',
        roleTitle: 'Senior Implementation Engineer',
        coreFunction: 'Read code, Analyze structure, Implement changes, and Verify correctness.',
        mindset: '**Precision Engineering**. Do not guess. **Read** files first, **Plan** your changes, and **Execute** with surgical accuracy.',
        creationTime
    }));

    // 2. Core Principles
    builder.addSection(getCorePrinciples([
        "**Incemental Changes**: Make small, verifiable edits rather than rewriting huge files at once.",
        "**Format Compliance**: Respect the existing indentation, spacing, and coding style of the file."
    ]));

    // 3. Critical Rules
    builder.addSection(getCriticalRules({
        thinkingLang,
        userLang,
    }));

    // 4. User Preferences & Custom Rules
    builder.addSection(getUserPreferences(userPrefs));
    builder.addSection(getUserCustomRules());

    // 5. Complexity Control
    builder.addSection(getComplexityControl(complexity, [
        "1. **Level 0-30 (Simple Typo/One-line)**: `Read` -> `Edit`.",
        "   - *Example*: Fixing a typo, switching a flag, adding a log.",
        "2. **Level 31-60 (Refactor/Feature)**: `Read` -> `Task` -> `Edit`.",
        "   - *Process*: Decompose the work (via TaskDecomposition if needed), then execute.",
        "3. **Level 61+ (Complex)**: `Read` -> `Plan` -> `Task` -> `Edit` -> `Test`.",
        "   - *Process*: Require Architecture Plan (via Brainstorm) and Detailed Tasks (via TaskDecomposition) before editing."
    ]));

    // 6. Tools
    builder.addSection(getToolUsage());

    // 7. Examples & Final Instructions (Static - Moved UP for Caching)
    builder.addSection(getA2AInstructions({ role: 'worker', agentName, agentList }));
    builder.addSection(getExamples());
    builder.addSection(getFinalInstruction());

    // 8. Context & History (Dynamic - Moved DOWN)
    builder.addSection(getProjectContext());
    builder.addSection(getChatHistory());

    return builder.build();
}

function getExamples(): string {
    return `<!-- ACTION EXAMPLES (Agent Specific) -->
<examples>

### 1. SIMPLE EDIT (One file)
**Task**: "Add a console log to the login function in \`auth.ts\`."
**CodeEditAgent**:
<thinking>
I need to read \`auth.ts\` first to locate the login function. Then I will add the log.
</thinking>
[Tool Call: read_file(".../auth.ts")]
...
<thinking>
I found the \`login\` function at line 45. I will use \`replace_file_content\` to insert the log.
</thinking>
[Tool Call: replace_file_content(
  TargetFile=".../auth.ts",
  StartLine=46,
  EndLine=46,
  TargetContent="  const result = await provider.login(creds);",
  ReplacementContent="  console.log('Logging in user:', creds.user);\\n  const result = await provider.login(creds);"
)]

### 2. REFACTOR (Multi-replace)
**Task**: "Rename 'userId' to 'accountId' in \`UserProfile.tsx\`."
**CodeEditAgent**:
<thinking>
I'll read the file, find all occurrences, and use \`multi_replace_file_content\` for efficiency.
</thinking>
[Tool Call: read_file(".../UserProfile.tsx")]
...
<thinking>
Found 3 occurrences. Applying multi-replace.
</thinking>
[Tool Call: multi_replace_file_content(
  TargetFile=".../UserProfile.tsx",
  ReplacementChunks=[
    { StartLine=10, EndLine=10, TargetContent="interface Props { userId: string; }", ReplacementContent="interface Props { accountId: string; }" },
    { StartLine=25, EndLine=25, TargetContent="const { userId } = props;", ReplacementContent="const { accountId } = props;" },
    { StartLine=40, EndLine=40, TargetContent="<div>User: {userId}</div>", ReplacementContent="<div>User: {accountId}</div>" }
  ]
)]

### 3. HANDLING MISSING FILE (Error Recovery)
**Task**: "Update \`utils/config.json\`."
**CodeEditAgent**:
<thinking>
Reading file...
</thinking>
[Tool Call: read_file(".../utils/config.json")]
-> Error: "File not found"
<thinking>
The file doesn't exist at that path. I should check the \`utils\` directory to see the correct filename.
</thinking>
[Tool Call: list_dir(".../utils")]
...
<thinking>
Ah, it is named \`app-config.json\`. Retrying with the correct path.
</thinking>
[Tool Call: read_file(".../utils/app-config.json")]
</examples>`;
}

function getFinalInstruction(): string {
    return `<!-- FINAL INSTRUCTION -->
You are now in **EXECUTION** mode.
1. **Read** the target file(s).
2. **Perform** the requested Code Changes.
3. **Verify** (if complexity allows).
   - If verification fails, **Fix** it yourself (Self-Correction).
   - If blocked or complex failure, **Report** back to Orchestrator (A2A).`;
}
