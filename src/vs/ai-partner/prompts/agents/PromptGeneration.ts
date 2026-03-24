import { PromptBuilder } from '../PromptBuilder';
import { AgentSystemPromptOptions } from '../types';
import { getRoleAndIdentity } from '../sections/Identity';
import { getCorePrinciples } from '../sections/Principles';
import { getCriticalRules } from '../sections/Rules';
import { getToolUsage } from '../sections/ToolUsage';
import { getComplexityControl } from '../sections/Complexity';
import { getUserPreferences, getUserCustomRules } from '../sections/UserPreferences';
// import { getProjectContext } from '../sections/Context'; // Tier 5
// import { getA2AInstructions } from '../sections/A2A'; 
import { getCloningInstructions } from '../sections/Cloning';
// import { getChatHistory } from '../sections/History'; // Tier 5

export const getPromptGenerationSystemPrompt = (options: AgentSystemPromptOptions): string => {
    const { userLang, complexity = 50, thinkingLang, userPrefs, isSubAgent } = options;
    const agentName = options.agentName || 'PromptGenerationAgent';


    const builder = new PromptBuilder(userLang);

    // 1. Identity & Role
    builder.addSection(getRoleAndIdentity({
        agentName,
        roleTitle: 'AI System Architect & Prompt Engineer',
        coreFunction: 'Design highly specialized behavioral rules for new dynamically spawned agents.',
        mindset: '**Structured & Methodological**. Prompts are code. Use logic, variables, and clear constraints.',
        creationTime: new Date().toISOString().split('T')[0],
        isSubAgent
    }));




    // 2. Principles
    builder.addSection(getCorePrinciples([
        "**Domain Specialization**: Instruct the new agent to be strict and focused solely on its assigned domain.",
        "**Tool Selection**: Determine exact MCP tools the specialized agent will need (e.g., 'read_file', 'list_dir').",
        "**JSON Formatting**: Output must exactly match the defined JSON schema."
    ]));

    // 3. Critical Rules
    builder.addSection(getCriticalRules({
        thinkingLang,
        userLang,
        customRules: [
            "DO NOT write a full system prompt. Write ONLY the specific behavioral rules, domain expertise instructions, and step-by-step strategies.",
            "The framework (Context, Memory, Complexity) will be attached automatically by the SystemPromptFactory.",
            "Generate a logical CamelCase 'roleName' for this agent (e.g., DatabaseMigrationAgent)."
        ]
    }));

    // 4. User Preferences & Custom Rules
    builder.addSection(getUserPreferences(userPrefs));
    builder.addSection(getUserCustomRules());
    builder.addSection(getCloningInstructions({ isSubAgent: !!options.isSubAgent, agentName: 'PromptGenerationAgent' }));


    // 5. Complexity Control
    builder.addSection(getComplexityControl(complexity));

    // 6. Tools
    builder.addSection(getToolUsage());

    // 7. Instructions & Examples
    builder.addSection(`OUTPUT FORMAT:
Return pure JSON wrapped in \`\`\`json tags matching this schema:
{
    "roleName": "string",
    "description": "string",
    "roleInstruction": "string",
    "requiredTools": ["tool1", "tool2"]
}`);

    // 8. Context & History (Tier 5 - Handled by runtime)
    // builder.addSection(getChatHistory()); // Removed to protect cache

    return builder.build();
};

