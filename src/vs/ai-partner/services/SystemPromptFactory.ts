import { ConfigService } from '../config_service';
import { getBrainstormSystemPrompt } from '../prompts/agents/Brainstorm';
import { getBugFixSystemPrompt } from '../prompts/agents/BugFix';
import { getCodeEditSystemPrompt } from '../prompts/agents/CodeEditing';
import { getOrchestratorSystemPrompt } from '../prompts/agents/Routing';
import { getReadmeGenerationSystemPrompt } from '../prompts/agents/ReadmeGeneration';
import { getContextManagementSystemPrompt } from '../prompts/agents/ContextManagement';
import { getTaskDecompositionSystemPrompt } from '../prompts/agents/TaskDecomposition';
import { getTestGenerationSystemPrompt } from '../prompts/agents/TestGeneration';
import { getDocumentationGenerationSystemPrompt } from '../prompts/agents/DocumentationGeneration';
import { SemanticModelService } from './SemanticModelService';
import { MemoryService } from './MemoryService';
// LegacyComplexity inlined below
import * as vscode from 'vscode';
import * as path from 'path';
import { LLMService } from './LLMService';



export type AgentRole = 'router' | 'pm' | 'planner' | 'worker' | 'debugger' | 'CodeEditAgent' | 'BugFixAgent' | 'BrainstormAgent' | 'ReadmeGenerationAgent' | 'ContextManagementAgent' | 'TaskDecompositionAgent' | 'TestGenerationAgent' | 'DocumentationGenerationAgent';

// Helper to get agent descriptions
const getAgentDescriptions = (): string => {
    const config = ConfigService.getInstance();
    const internalAgents = config.getInternalAgents();
    return internalAgents.map(a => `- **${a.name}**: ${a.description}`).join('\n');
};

export class SystemPromptFactory {
    private static readonly PROJECT_CONTEXT_LIMIT = 20000; // 20k Token Limit

    public static async generate(role: AgentRole, agentName: string, complexity: number = 3, userInput: string = '', contextOptions?: { targetFile?: string; relatedFiles?: string[], excludeHistory?: boolean, targetContent?: string, dynamicRules?: string[], examples?: string }): Promise<string> {
        const worldModel = SemanticModelService.getInstance();
        const memory = MemoryService.getInstance();
        
        const llmService = LLMService.getInstance();
        const userPrefs = await memory.getPreferences();

        // 5. Dynamic Language Detection (Moved Up)
        const vscodeLang = vscode.env.language.toLowerCase();
        let targetLanguage = userPrefs?.language || 'Korean'; 
        if (vscodeLang.startsWith('ko')) { targetLanguage = 'Korean'; }
        else if (vscodeLang.startsWith('en')) { targetLanguage = 'English'; }
        else if (vscodeLang.startsWith('ja')) { targetLanguage = 'Japanese'; }
        else if (vscodeLang.startsWith('zh')) { targetLanguage = 'Chinese'; }
        
        console.log(`[SystemPromptFactory] Lang Detection - VSCode: ${vscodeLang}, Prefs: ${userPrefs?.language}, Target: ${targetLanguage}`);
        
        // Context Strategy:
        // 1. High-Level Agents (Router/Planner) -> Always Tree Only (Efficiency)
        // 2. Worker Agents -> Smart Context (Targeted)
        
        console.log('[SystemPromptFactory] Step 1: Checking HighLevelAgent');
        const isHighLevelAgent = ['router', 'planner', 'pm'].includes(role) || agentName === 'OrchestratorAgent';
        let projectContext = '';

        if (isHighLevelAgent) {
            console.log('[SystemPromptFactory] Step 1a: Getting Directory Structure');
            projectContext = worldModel.getDirectoryStructureOnly();
            console.log('[SystemPromptFactory] Step 1b: Directory Structure Retrieved');
        } else {
            console.log('[SystemPromptFactory] Step 2: Worker Context Strategy');
            // Worker Strategy: Smart Context (Targeted)
            // Priority 0: Explicit Target from Orchestrator (contextOptions)
            // Priority 1: User Explicitly Mentions File in Prompt (Parsing)
            // Priority 2: Active Text Editor (Fallback)
            
            let targetFile = contextOptions?.targetFile || '';
            let relatedFiles = contextOptions?.relatedFiles || [];
            
            // 1. Scan User Input if no explicit target
            if (!targetFile && userInput) {
                const words = userInput.split(/\s+/);
                for (const word of words) {
                    const potentialPath = word.replace(/['"`\[\](),]/g, '');
                    if (potentialPath.includes('/') || potentialPath.includes('.')) {
                        const relativePathCandidates = Object.keys(worldModel['graph'].files);
                        const match = relativePathCandidates.find(f => f.endsWith(potentialPath) || potentialPath.endsWith(f));
                        
                        if (match) {
                            targetFile = path.join(worldModel['workspaceRoot'], match);
                            console.log(`[SystemPromptFactory] Detected target file from prompt: ${match}`);
                            break;
                        }
                    }
                }
            }

            // 2. Fallback to Active Editor
            if (!targetFile) {
                targetFile = vscode.window.activeTextEditor?.document.uri.fsPath || '';
            }

            if (targetFile || relatedFiles.length > 0) {
                // "Smart Context": Tree + Active File + Relations
                const smartContext = worldModel.getSmartContext(targetFile, relatedFiles);
                
                // Safety Check
                const smartCount = llmService.countTokens(smartContext);
                if (smartCount <= SystemPromptFactory.PROJECT_CONTEXT_LIMIT) {
                    projectContext = smartContext;
                } else {
                    projectContext = worldModel.getDirectoryStructureOnly() + 
                        `\n\n> [Info] Smart context too large (${smartCount}). Reverted to Tree Only.`;
                }
            } else {
                // No context anchor -> Full Overview or Tree
                const fullContext = worldModel.getContextForQuery('overview');
                const tokenCount = llmService.countTokens(fullContext);

                if (tokenCount <= SystemPromptFactory.PROJECT_CONTEXT_LIMIT) {
                    projectContext = fullContext;
                } else {
                    projectContext = worldModel.getDirectoryStructureOnly();
                }
            }
        }
            
        console.log('[SystemPromptFactory] Step 3: Preparing Base Prompt');
        const basePrompt = `You are ${agentName}, a specialized AI assistant in the Viper ecosystem.`;
        const agentList = getAgentDescriptions();
        
        // 1. Role Definitions & Agent Awareness
        let roleInstruction = '';
        let collaborationInstruction = '';

        console.log(`[SystemPromptFactory] Step 4: Switch Role (${role})`);
        switch(role) {
            case 'router': // Orchestrator
                console.log('[SystemPromptFactory] Step 4a: Router Config Loading');
                const config = ConfigService.getInstance();
                // ConfigService does not expose features directly, using simple derivation
                const thinkingLang = config.getThinkingLanguage();
                const userLang = vscode.env.language;
                
                // Filter out OrchestratorAgent for the prompt
                const routerAgentList = config.getInternalAgents()
                    .filter(a => a.name !== 'OrchestratorAgent')
                    .map(a => `- **${a.name}**: ${a.description}`)
                    .join('\n');

                console.log('[SystemPromptFactory] Step 4b: Generating Orchestrator Prompt');
                const p = getOrchestratorSystemPrompt({
                    agentList: routerAgentList,
                    complexity,
                    userPrefs: userPrefs || { language: 'Korean', codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang,
                    projectContext,
                    creationTime: memory.getSessionStartTime()
                });
                console.log('[SystemPromptFactory] Step 4c: Orchestrator Prompt Generated');
                return p;

            case 'pm': // TaskDecomposition
                roleInstruction = `
ROLE: Project Manager (Task Decomposition)
- Break down complex objectives into atomic, executable tasks (Level 1-2).
- Ensure dependency order is logical.
`;
                collaborationInstruction = `
## TARGET EXECUTION AGENTS
Your tasks will be executed by the following team of agents:
${agentList}

**Decomposition Strategy:**
- Structure tasks so they map clearly to these agents' domains (Coding, Testing, Documentation).
- Keep tasks atomic enough for a single agent to handle in one turn if possible.
`;
                break;

            case 'planner': // Brainstorm
            case 'BrainstormAgent': {
                const config = ConfigService.getInstance();
                return getBrainstormSystemPrompt({
                    agentName,
                    agentList: getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: 'Korean', codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang: 'en',
                    userLang: targetLanguage,
                    creationTime: memory.getSessionStartTime()
                });
            }

            case 'CodeEditAgent': {
                return getCodeEditSystemPrompt({
                    agentName,
                    agentList: getAgentDescriptions(),
                    complexity: 50,
                    userPrefs: userPrefs || { language: 'Korean', codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang: 'en',
                    userLang: targetLanguage,
                    creationTime: memory.getSessionStartTime()
                });
            }

            case 'ReadmeGenerationAgent': {
                return getReadmeGenerationSystemPrompt({
                    agentName,
                    userLang: targetLanguage,
                    complexity,
                    thinkingLang: 'en',
                    creationTime: memory.getSessionStartTime(),
                    userPrefs: userPrefs || { language: 'Korean', codingStyle: 'Standard', preferredFrameworks: [] },
                    projectContext
                });
            }

            case 'BugFixAgent':
            case 'debugger': { // Compatibility
                return getBugFixSystemPrompt({
                    agentName,
                    agentList: getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: 'Korean', codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang: 'en',
                    userLang: targetLanguage,
                    creationTime: memory.getSessionStartTime()
                });
            }

            case 'ContextManagementAgent': {
                return getContextManagementSystemPrompt({
                    agentName,
                    userLang: targetLanguage,
                    complexity,
                    thinkingLang: 'en',
                    creationTime: memory.getSessionStartTime(),
                    userPrefs: userPrefs || { language: 'Korean', codingStyle: 'Standard', preferredFrameworks: [] },
                    projectContext,
                    excludeHistory: contextOptions?.excludeHistory,

                    targetContent: contextOptions?.targetContent,
                    dynamicRules: contextOptions?.dynamicRules,
                    examples: contextOptions?.examples
                });
            }

            case 'TestGenerationAgent':
                return getTestGenerationSystemPrompt({
                    agentName,
                    agentList: getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: 'Korean', codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang: 'en',
                    userLang: targetLanguage,
                    creationTime: memory.getSessionStartTime(),
                    projectContext
                });

            case 'DocumentationGenerationAgent':
                return getDocumentationGenerationSystemPrompt({
                    agentName,
                    agentList: getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: 'Korean', codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang: 'en',
                    userLang: targetLanguage,
                    creationTime: memory.getSessionStartTime(),
                    projectContext
                });

            case 'worker': // CodeEdit, Test, Doc, Readme, ContextMgmt
                roleInstruction = `
ROLE: Skilled Developer (Worker)
- Execute assigned tasks with precision.
- You are an expert in your domain (Coding, Testing, or Documentation).
- Follow the "Execution Rigor" based on assigned complexity.
`;
                collaborationInstruction = `
## A2A COLLABORATION
You are part of a multi-agent team. You can DELEGATE subtasks to other agents if they are better suited for specific actions.
**Available Agents:**
${agentList}

**How to Delegate / Ask:**
- You **MUST** use the A2A JSON format defined in your system prompt.
- **DO NOT** use natural language to talk to other agents.
- **Target**: Use exact agent names from the list above.
`;
                break;

            default:
                roleInstruction = `ROLE: Reliable AI Assistant.`;
        }

        // 2. User Preferences Injection
        const preferenceSection = userPrefs ? `
USER PREFERENCES:
- Language: ${userPrefs.language}
- Style: ${userPrefs.codingStyle}
- Frameworks: ${userPrefs.preferredFrameworks.join(', ')}
` : '';

        // 3. Project Context Injection
        const contextSection = `
PROJECT CONTEXT:
${projectContext}
`;

        // 4. Complexity Control (Dynamic Injection)
        const effectiveRoleForComplexity = role;
        const complexitySection = getLegacyComplexityControl(effectiveRoleForComplexity as any, complexity);

        // 5. Dynamic Language Detection

        
        console.log(`[SystemPromptFactory] Lang Detection - VSCode: ${vscodeLang}, Prefs: ${userPrefs?.language}, Target: ${targetLanguage}`);

        // 6. Thinking Protocol
        const thinkingProtocol = (agentName !== 'OrchestratorAgent' && agentName !== 'Orchestrator') ? `
4. **Thinking Protocol**:
   - You MUST plan your actions by enclosing your thought process in \`<thinking>...</thinking>\` tags BEFORE calling any tool.
   - This prevents errors and helps the user understand your logic.
   - Example:
     \`\`\`
     <thinking>
     I need to read the file 'utils.ts' to understand the helper function signature before I can generate the test.
     </thinking>
     [Call FileReadTool]
     \`\`\`
     ` : '';

        return `
${basePrompt}
${roleInstruction}
${collaborationInstruction}
${preferenceSection}
${contextSection}
${complexitySection}

CRITICAL RULES:
1. NO KEYWORD PARSING. Always return structured JSON for tool calls and final responses.
2. Respect the user's existing code style.
3. Be proactive but safe.

LANGUAGE RULES:
1. **USER-FACING OUTPUT**: When speaking to the User (final responses, questions, chat bubbles), YOU MUST USE "${targetLanguage}".
   - Do NOT use English for explanations unless the target language IS English.
2. **INTERNAL THOUGHTS & TOOLS**: For internal reasoning (Thinking) and Tool execution/arguments, you MAY use English.
${thinkingProtocol}
6. **A2A Protocol Compliance**:
   - IF the input request contains a \`correlation\` object (with \`planId\`, \`stepId\`, etc.), you **MUST** include it VERBATIM in your final JSON response.
   - This is CRITICAL for the Orchestrator to track your work.
   - Example Response:
     \`\`\`json
     {
       "status": "success",
       "correlation": { "planId": "...", "stepId": "..." },
       "result": "..."
     }
     \`\`\`

5. **Efficiency**: Do not translate code or tool parameters unless necessary.
`;
    }
    }


// Inlined from LegacyComplexity.ts to avoid build resolution issues
const getLegacyComplexityControl = (role: 'router' | 'worker' | 'planner' | 'pm', complexity: number): string => {
    // 1. Router Logic (Orchestrator)
    if (role === 'router') {
        return `
## COMPLEXITY CONTROL (Router)
- **Target Level**: ${complexity} (0-100)
- **Orchestration Logic**:
  1. **Level 0-30 (Simple)**: Execute directly. Do NOT delegate if you can answer or perform simple tasks (e.g. read file, fix typo).
  2. **Level 31-60 (Medium)**: Delegate to \`TaskDecomposition\`. Requirement: Split into tasks of Difficulty 10-20.
  3. **Level 61-90 (Hard)**: Delegate to \`Brainstorm\` (Planning Mode). Requirement: Create Plans (Difficulty <=50), then decompose into Tasks (Difficulty 10-20).
  4. **Level 91-100 (Project)**: Propose "Uroboros Mode" to user. 
     - If accepted: Construct a master plan interactively until all steps are simplified.
     - You MUST include \`complexity\` in the message payload when delegating.
`;
    }

    // 2. Worker Logic (CodeEdit, Doc, Test)
    if (role === 'worker') {
        return `
## EXECUTION RIGOR (Worker)
- **Assigned Difficulty**: ${complexity} (Should be 10-20)
- **Self-Correction Logic**:
  1. <thinking>: Evaluate if the task is truly Level ${complexity}.
  2. **Mismatch Handling**:
     - If Task requires extensive planning/research but assigned Level is 10-20: **REJECT** with "Task too complex, please decompose."
     - If Task is simple but assigned Level is high: **DOWNGRADE** to Level 10 and execute fast.
  3. **Action Guide**:
     - **Level 0-20 (Routine)**: Trust intuition. Code immediately. Minimal chain-of-thought.
     - **Level 21-40 (Caution)**: Check imports and existing types first. Verify before writing.
     - **Level 41+ (Complex)**: STOP. This task is likely too big for a single execution step. Consider rejecting or requesting decomposition.
`;
    }

    // 3. Planner Logic (Brainstorm)
    if (role === 'planner') {
        return `
## ARCHITECTURAL PLANNING (Planner)
- **Target Complexity**: ${complexity} (Typically 70-100)
- **Behavior**:
  - **Planning Mode**: Focus on "Solution Strategy", not just task lists.
  - **Rejection**: If the task is trivial (Level 0-30), REJECT it and tell Orchestrator to handle it directly.
  - **Output**: Detailed architectural plans, pros/cons analysis, and dependency graphs.
`;
    }



    return '';
};
