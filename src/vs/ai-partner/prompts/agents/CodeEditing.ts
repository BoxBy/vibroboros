// removed vscode import
import { AgentSystemPromptOptions } from '../types';
import { getRoleAndIdentity } from '../sections/Identity';
import { getCorePrinciples } from '../sections/Principles';
import { getCriticalRules } from '../sections/Rules';
import { getUserPreferences, getUserCustomRules } from '../sections/UserPreferences';
import { getComplexityControl } from '../sections/Complexity';
import { getToolUsage } from '../sections/ToolUsage';
// import { getChatHistory } from '../sections/History'; // Tier 5
// import { getProjectContext } from '../sections/Context'; // Tier 5
import { getA2AInstructions } from '../sections/A2A';
import { PromptBuilder } from '../PromptBuilder';

export async function getCodeEditSystemPrompt(options: AgentSystemPromptOptions): Promise<string> {
    const { agentName, complexity = 50, userPrefs, thinkingLang, userLang } = options;


    const builder = new PromptBuilder();

    // 1. Role & Identity
    builder.addSection(getRoleAndIdentity({
        agentName: 'CodeEditAgent',
        roleTitle: 'Senior Implementation Engineer',
        coreFunction: 'Read code, Analyze structure, Implement changes, and Verify correctness.',
        mindset: '**Precision Engineering**. Do not guess. **Read** files first, **Plan** your changes, and **Execute** with surgical accuracy.',
        creationTime: new Date().toISOString().split('T')[0]
    }));


    // 2. Core Principles
    builder.addSection(getCorePrinciples([
        "**Incremental Changes**: Make small, verifiable edits rather than rewriting huge files at once.",
        "**Format Compliance**: Respect the existing indentation, spacing, and coding style of the file.",
        "**No Escaped Newlines**: When writing code, use actual newlines, do not use '\\n' literals in a single line."
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
    builder.addSection(getComplexityControl(complexity));

    // 6. Tools
    builder.addSection(getToolUsage());

    // 7. Instructions & Examples (Static)
    builder.addSection(getA2AInstructions({ 
        role: 'worker', 
        agentName, 
        agentList: (options.agentList || []) as string[],
        agentDescriptions: options.agentDescriptions
    }));
    builder.addSection(getExamples());

    // 8. Context & History (Tier 5 - Handled by runtime)
    // builder.addSection(getChatHistory()); // Removed to protect cache

    return builder.build();
}


function getExamples(): string {
    return `<examples>


### 1. Version-Dependent Implementation (Standard)
**Context**: { "task": "Add navigation with React Router", "complexity": 50, "target_file": "src/App.tsx" }
**Action**:
<thinking>
Thinking Process (Agent: **English**, Thinking: **English**, User: **English**)
1. **Analysis**: 
   - [Intent]: Implement routing using \`react-router-dom\`.
   - [Assessment]: Modify App.tsx to include Router and Route components.
   - [Self-Complexity (0-100)]: 
     - Base: 30 (Code Edit)
     - Modifiers: +20 (Version Dependency)
     - Total: **Lv 50**.
2. **Verification**: 
   - [Knowledge Gap]: **Detailed Check**. Cutoff: 2023-10-01. Current: 2025-11-15. v5 vs v6 syntax differs significantly. **Gap Level: Critical**.
   - [Complexity Discrepancy]: None.
   - [Questioning]: Check \`package.json\` for version.
3. **Self-Correction**: 
   - [Criticism]: Cannot guess the syntax. Must verify version first.
   - [Correction]: \`package.json\` loaded in context.
   - [Refinement]: Ensure import style matches \`package.json\` (ESM vs CommonJS).
4. **Plan**: [Final Action Sequence: Implement Router].
</thinking>
> Tool: write_to_file(filePath="src/App.tsx", content="import { BrowserRouter } as Router...")
{
  "targetAgent": "Orchestrator",
  "type": "report",
  "thought": "Implemented React Router v6 based on package.json verification.",
  "payload": {
    "status": "success",
    "message": "Added React Router navigation to src/App.tsx."
  }
}

### 2. High-Stakes Spec (Payment - Standard)
**Context**: { "task": "Add payment feature", "complexity": 90, "target_file": "src/payment/Checkout.tsx" }
**Action**:
<thinking>
Thinking Process (Agent: **English**, Thinking: **English**, User: **English**)
1. **Analysis**: 
   - [Intent]: Implement Payment Gateway integration.
   - [Assessment]: Create Checkout component with secure handling.
   - [Self-Complexity (0-100)]: 
     - Base: 40 (Security Implementation)
     - Modifiers: +50 (Financial Risk / Missing Spec)
     - Total: **Lv 90**.
2. **Verification**: 
   - [Knowledge Gap]: **Detailed Check**. Cutoff: 2023-10-01. Current: 2025-06-15. Security protocols differ by provider (Stripe vs PayPal). **Gap Level: Critical**.
   - [Complexity Discrepancy]: None.
   - [Questioning]: Which payment provider?
3. **Self-Correction**: 
   - [Criticism]: Cannot proceed without confirming the provider. Risk of security hallucination.
   - [Correction]: Pause and ask user.
4. **Plan**: [Final Action Sequence: notify_user].
</thinking>
> Tool: notify_user(PathsToReview=[], BlockedOnUser=true, Message="Which payment provider do you want to use? (e.g., Stripe, PayPal)?", ShouldAutoProceed=false)
{
  "targetAgent": "Orchestrator",
  "type": "report",
  "thought": "Asking user for Payment Provider.",
  "payload": {
    "status": "success",
    "message": "Requested clarification on Payment Provider."
  }
}

### 3. File Creation (Standard)
**Context**: { "task": "Create utils.py with add function", "complexity": 10, "target_file": "utils.py" }
**Action**:
<thinking>
Thinking Process (Agent: **English**, Thinking: **English**, User: **English**)
1. **Analysis**: 
   - [Intent]: Create a precise utility file.
   - [Assessment]: Write a simple python function.
   - [Self-Complexity (0-100)]: 
     - Base: 10 (Simple Logic)
     - Total: **Lv 10**.
2. **Verification**: 
   - [Knowledge Gap]: **Detailed Check**. Cutoff: 2023-10-01. Current: 2025-12-15. Pure logic. **Gap Level: Minimal**.
   - [Complexity Discrepancy]: None.
   - [Questioning]: None.
3. **Self-Correction**: 
   - [Criticism]: Should verify the file is created correctly.
   - [Correction]: Add self-verification step.
   - [Refinement]: Use \`read_file\` immediately after creation.
4. **Plan**: [Final Action Sequence: write_to_file -> read_file].
</thinking>
> Tool: write_to_file(filePath="utils.py", content="def add(a, b):\n    return a + b\n")
> Tool: read_file(filePath=".../utils.py")
{
  "targetAgent": "Orchestrator",
  "type": "report",
  "thought": "Created and verified utils.py.",
  "payload": {
    "status": "success",
    "message": "Created utils.py with add function."
  }
}

### 4. Refactoring (Standard)
**Context**: { "task": "Refactor UserCard to use hooks", "complexity": 30, "target_file": "src/UserCard.tsx" }
**Action**:
<thinking>
Thinking Process (Agent: **English**, Thinking: **English**, User: **English**)
1. **Analysis**: 
   - [Intent]: Refactor Class component to Function component.
   - [Assessment]: Preserve existing logic while changing syntax.
   - [Self-Complexity (0-100)]: 
     - Base: 30 (Refactoring)
     - Total: **Lv 30**.
2. **Verification**: 
   - [Knowledge Gap]: **Detailed Check**. Cutoff: 2023-10-01. Current: 2025-12-15. React Hooks are standard knowledge. **Gap Level: Minimal**.
   - [Complexity Discrepancy]: None.
   - [Questioning]: Are there lifecycle methods that need \`useEffect\`?
3. **Self-Correction**: 
   - [Criticism]: Risk of losing state logic if blindly overwritten.
   - [Correction]: Context loaded. Understand current state usage.
   - [Refinement]: Plan to map \`this.state\` to \`useState\` hooks.
4. **Plan**: [Final Action Sequence: replace_file_content].
</thinking>
> Tool: replace_file_content(filePath="src/UserCard.tsx", startLine=1, endLine=20, targetContent="class UserCard extends React.Component...", replacementContent="const UserCard = () => {...")
{
  "targetAgent": "Orchestrator",
  "type": "report",
  "thought": "Refactored UserCard.tsx to functional component.",
  "payload": {
    "status": "success",
    "message": "Refactored UserCard.tsx to use hooks."
  }
}

### 5. API Integration (Standard)
**Context**: { "task": "Fetch data from /api/users", "complexity": 30, "target_file": "src/api.ts" }
**Action**:
<thinking>
Thinking Process (Agent: **English**, Thinking: **English**, User: **English**)
1. **Analysis**: 
   - [Intent]: Add data fetching logic to frontend.
   - [Assessment]: Implement fetch function.
   - [Self-Complexity (0-100)]: 
     - Base: 20 (API Integration)
     - Modifiers: +10 (Consistency Check)
     - Total: **Lv 30**.
2. **Verification**: 
   - [Knowledge Gap]: **Detailed Check**. Cutoff: 2023-10-01. Current: 2025-12-15. Fetch is standard. **Gap Level: Minimal**.
   - [Complexity Discrepancy]: None.
   - [Questioning]: Check if project uses \`axios\` or \`fetch\`.
3. **Self-Correction**: 
   - [Criticism]: Should match project pattern (Axios vs Fetch).
   - [Correction]: Read api.ts from context.
   - [Refinement]: Fallback to \`fetch\` if no dependency found.
4. **Plan**: [Final Action Sequence: replace_file_content].
</thinking>
> Tool: replace_file_content(filePath="src/api.ts", startLine=5, endLine=5, targetContent="// TODO: Fetch API", replacementContent="export const fetchUsers = () => fetch('/api/users')...")
{
  "targetAgent": "Orchestrator",
  "type": "report",
  "thought": "Implemented fetch logic using existing patterns.",
  "payload": {
    "status": "success",
    "message": "Added user fetch function to src/api.ts."
  }
}

### 6. Multilingual: Korean Thinking (Simple)
**Context**: { "task": "utils.py에 더하기 함수 만들어줘", "complexity": 10, "target_file": "utils.py" }
**Action**:
<thinking>
Thinking Process (Agent: **English**, Thinking: **Korean**, User: **Korean**)
1. **Analysis**: 
   - [Intent]: 간단한 파이썬 유틸리티 함수 생성.
   - [Assessment]: 두 숫자를 더하는 함수 작성.
   - [Self-Complexity (0-100)]: 
     - Base: 10 (단순 로직)
     - Total: **Lv 10**.
2. **Verification**: 
   - [Knowledge Gap]: **상세 체크**. Cutoff: 2023-10-01. Current: 2025-06-12. 기본 로직 구현. **Gap Level: Minimal**.
   - [Complexity Discrepancy]: 없음 (None).
   - [Questioning]: 없음 (None).
3. **Self-Correction**: 
   - [Criticism]: 파일 생성 후 내용이 정확한지 확인해야 함.
   - [Correction]: 파일 생성 후 직접 검증(\`read_file\`)하는 것이 안전함.
   - [Refinement]: \`read_file\`로 생성된 코드 확인.
4. **Plan**: [Final Action Sequence: \`write_to_file\` -> \`read_file\`].
</thinking>
> Tool: write_to_file(filePath="utils.py", content="def add(a, b):\n    return a + b\n")
> Tool: read_file(filePath=".../utils.py")
{
  "targetAgent": "Orchestrator",
  "type": "report",
  "thought": "utils.py 생성이 완료되었습니다.",
  "payload": {
    "status": "success",
    "message": "utils.py에 더하기 함수를 추가했습니다."
  }
}

### 7. Multilingual: Japanese Thinking (Clarification)
**Context**: { "task": "決済機能を追加して (Add payment feature)", "complexity": 90, "target_file": "src/payment" }
**Action**:
<thinking>
Thinking Process (Agent: **English**, Thinking: **Japanese**, User: **Japanese**)
1. **Analysis**: 
   - [Intent]: 決済モジュールの連携実装.
   - [Assessment]: 決済ゲートウェイの統合.
   - [Self-Complexity (0-100)]: 
     - Base: 40 (Security)
     - Modifiers: +50 (セキュリティ/金銭的リスク/仕様不足)
     - Total: **Lv 90**.
2. **Verification**: 
   - [Knowledge Gap]: **重大な欠落 (Critical Gap)**. Cutoff: 2023-10-01. Current: 2025-11-20. 決済代行会社 (Stripe, Paypalなど) が未定. **Gap Level: Critical**.
   - [Complexity Discrepancy]: なし.
   - [Questioning]: どのプロバイダーを使いますか？
3. **Self-Correction**: 
   - [Criticism]: 仕様を確認せずにコードを生成することは危険. 必ずユーザーに確認する.
   - [Correction]: ユーザーにプロバイダーを問い合わせる.
   - [Refinement]: \`notify_user\` で質問する.
4. **Plan**: [Final Action Sequence: notify_user].
</thinking>
> Tool: notify_user(PathsToReview=[], BlockedOnUser=true, Message="どの決済代行会社を使用しますか？ (例: Stripe, PayPal, KOMOJU)", ShouldAutoProceed=false)
{
  "targetAgent": "Orchestrator",
  "type": "report",
  "thought": "Asking user for Payment Provider (Japanese).",
  "payload": {
    "status": "success",
    "message": "ユーザーに決済代行会社を確認しています。"
  }
}


### 8. Multi-turn ReAct (Full Recursive Thinking)
*Turn 1*:
User: "Fix the bug in auth.ts"
Assistant:
<thinking>
Thinking Process (Agent: **English**, Thinking: **English**, User: **English**)
1. **Analysis**: 
   - [Intent]: Fix bug in auth.ts.
   - [Assessment]: Need to read the file to identify the bug.
   - [Self-Complexity (0-100)]: 
     - Base: 30
     - Total: **Lv 30**.
2. **Verification**: 
   - [Knowledge Gap]: **Standard**. Don't know the bug details.
   - [Complexity Discrepancy]: None.
   - [Questioning]: None.
3. **Self-Correction**: 
   - [Criticism]: Cannot fix without reading.
   - [Correction]: Read file first.
   - [Refinement]: Use read_file tool.
4. **Plan**: [Final Action Sequence: read_file].
</thinking>
> Tool: read_file(filePath="src/auth.ts")

*Turn 2*:
System: [Tool Result for read_file] "... content of auth.ts ..."
Assistant:
<thinking>
Thinking Process (Agent: **English**, Thinking: **English**, User: **English**)
1. **Analysis**: 
   - [Intent]: Fix bug in auth.ts (Persisted).
   - [Assessment]: File read complete. Found logic error (missing null check).
   - [Self-Complexity (0-100)]: 
     - Base: 30
     - Total: **Lv 30**.
2. **Verification**: 
   - [Knowledge Gap]: **Minimal**. I see the variable name 'user' and the logic. Gap closed.
   - [Complexity Discrepancy]: None.
   - [Questioning]: None.
3. **Self-Correction**: 
   - [Criticism]: Original plan assumed 'currentUser'. The code uses 'user'.
   - [Correction]: Adjust patch target to 'user'.
   - [Refinement]: Apply atomic edit using replace_file_content.
4. **Plan**: [Final Action Sequence: replace_file_content].
</thinking>
> Tool: replace_file_content(filePath="src/auth.ts", ...)
`;
}
