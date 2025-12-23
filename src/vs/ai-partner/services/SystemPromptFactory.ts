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

        // 5. Dynamic Language Detection (Sync with Config)
        const config = ConfigService.getInstance();
        const targetLanguage = config.getUserLanguage();
        const thinkingLang = config.getThinkingLanguage(); 
        const cwd = config.getWorkspacePath();

        console.log(`[SystemPromptFactory] Lang Detection - Target: ${targetLanguage}, Thinking: ${thinkingLang}, CWD: ${cwd}`);
        
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
                const routerAgents = config.getInternalAgents().filter(a => a.name !== 'OrchestratorAgent');
                const routerAgentList = routerAgents.map(a => a.name);
                const routerAgentDescriptions = routerAgents.map(a => `- **${a.name}**: ${a.description}`).join('\n');
                const p = getOrchestratorSystemPrompt({
                    agentName: 'OrchestratorAgent',
                    agentList: routerAgentList,
                    agentDescriptions: routerAgentDescriptions,
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    projectContext,
                    creationTime: memory.getSessionStartTime(),
                    cwd
                });
                console.log('[SystemPromptFactory] Step 4c: Orchestrator Prompt Generated');
                return p;

            case 'pm': // TaskDecomposition
                return getTaskDecompositionSystemPrompt({
                    agentName,
                    agentList: config.getInternalAgents().map(a => a.name),
                    agentDescriptions: getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    projectContext,
                    userInput,
                    creationTime: memory.getSessionStartTime(),
                    cwd
                });

            case 'planner': // Brainstorm
            case 'BrainstormAgent': {
                return getBrainstormSystemPrompt({
                    agentName,
                    agentList: config.getInternalAgents().map(a => a.name),
                    agentDescriptions: getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    projectContext,
                    userInput,
                    creationTime: memory.getSessionStartTime(),
                    cwd
                });
            }

            case 'CodeEditAgent': {
                return getCodeEditSystemPrompt({
                    agentName,
                    agentList: config.getInternalAgents().map(a => a.name),
                    agentDescriptions: getAgentDescriptions(),
                    complexity: 50,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    projectContext,
                    userInput,
                    creationTime: memory.getSessionStartTime(),
                    cwd
                });
            }

            case 'ReadmeGenerationAgent': {
                return getReadmeGenerationSystemPrompt({
                    agentName,
                    agentList: config.getInternalAgents().map(a => a.name),
                    agentDescriptions: getAgentDescriptions(),
                    userLang: targetLanguage,
                    complexity,
                    thinkingLang,
                    creationTime: memory.getSessionStartTime(),
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    userInput,
                    projectContext,
                    cwd
                });
            }

            case 'BugFixAgent':
            case 'debugger': { // Compatibility
                return getBugFixSystemPrompt({
                    agentName,
                    agentList: config.getInternalAgents().map(a => a.name),
                    agentDescriptions: getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    projectContext,
                    userInput,
                    creationTime: memory.getSessionStartTime(),
                    cwd
                });
            }

            case 'ContextManagementAgent': {
                return getContextManagementSystemPrompt({
                    agentName,
                    agentList: config.getInternalAgents().map(a => a.name),
                    agentDescriptions: getAgentDescriptions(),
                    userLang: targetLanguage,
                    complexity,
                    thinkingLang,
                    creationTime: memory.getSessionStartTime(),
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    projectContext,
                    userInput,
                    excludeHistory: contextOptions?.excludeHistory,
                    targetContent: contextOptions?.targetContent,
                    dynamicRules: contextOptions?.dynamicRules,
                    examples: contextOptions?.examples,
                    cwd
                });
            }

            case 'TestGenerationAgent':
                return getTestGenerationSystemPrompt({
                    agentName,
                    agentList: config.getInternalAgents().map(a => a.name),
                    agentDescriptions: getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    creationTime: memory.getSessionStartTime(),
                    projectContext,
                    userInput,
                    cwd
                });

            case 'DocumentationGenerationAgent':
                return getDocumentationGenerationSystemPrompt({
                    agentName,
                    agentList: config.getInternalAgents().map(a => a.name),
                    agentDescriptions: getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    creationTime: memory.getSessionStartTime(),
                    projectContext,
                    userInput,
                    cwd
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
- Language: ${userPrefs?.language || targetLanguage}
- Style: ${userPrefs?.codingStyle || 'Standard'}
- Frameworks: ${userPrefs?.preferredFrameworks?.join(', ') || 'N/A'}
` : '';

        // 3. Project Context Injection
        const targetFileDisplay = contextOptions?.targetFile ? `- **Target File**: ${contextOptions.targetFile}` : '';
        const relatedFilesDisplay = contextOptions?.relatedFiles?.length ? `- **Related Files**: ${contextOptions.relatedFiles.join(', ')}` : '';
        const contextMeta = (targetFileDisplay || relatedFilesDisplay) ? `
TARGET CONTEXT:
${targetFileDisplay}
${relatedFilesDisplay}
` : '';

        const contextSection = `
PROJECT CONTEXT:
${projectContext}
${contextMeta}
- **Current Working Directory**: ${cwd || 'No workspace open'}
`;

        // 4. Complexity Control (Dynamic Injection)
        const effectiveRoleForComplexity = role;
        const complexitySection = getLegacyComplexityControl(effectiveRoleForComplexity as any, complexity);

        // 5. Final Assembly
        return [
             basePrompt,
             roleInstruction,
             preferenceSection,
             complexitySection,
             contextSection,
             collaborationInstruction
        ].filter(Boolean).join('\n\n');
    }
}

function getLegacyComplexityControl(role: string, complexity: number): string {
    if (role === 'worker' || role === 'CodeEditAgent' || role === 'BugFixAgent' || role === 'TestGenerationAgent' || role === 'DocumentationGenerationAgent' || role === 'ReadmeGenerationAgent' || role === 'ContextManagementAgent') {
        return `
## EXECUTION RIGOR (Worker)
- **Complexity Level**: ${complexity}
- **Self-Correction Logic**:
  1. <thinking>: Evaluate if the task is truly Level ${complexity}.
  2. **Mismatch Handling**:
     - If Task requires extensive planning/research but assigned Level is 10-30: **REJECT** with "Task too complex, please decompose." (Use A2A Handover).
     - If Task is simple but assigned Level is 70+: **DOWNGRADE** to Level 10 and execute.
  3. **Action Guide**:
     - **Level 0-30 (Routine)**: Trust intuition. Code immediately. Minimal chain-of-thought.
     - **Level 31-70 (Standard)**: Check imports and existing types first. Verify before writing.
     - **Level 71+ (Complex)**: STOP. This task is likely too big for a single execution step. Handover or Decompose.
`;
    }
    // Default or other roles
    return '';
}
