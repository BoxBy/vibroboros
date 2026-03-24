import type { IConfigService } from '../di/interfaces/IConfigService';
import type { ISystemPromptFactory, AgentRole, GenerateOptions } from '../di/interfaces/ISystemPromptFactory';
import { ServiceLocator } from '../di/ServiceLocator';
import { getBrainstormSystemPrompt } from '../prompts/agents/Brainstorm';
import { getBugFixSystemPrompt } from '../prompts/agents/BugFix';
import { getCodeEditSystemPrompt } from '../prompts/agents/CodeEditing';
import { getOrchestratorSystemPrompt } from '../prompts/agents/Routing';
import { getReadmeGenerationSystemPrompt } from '../prompts/agents/ReadmeGeneration';
import { getContextManagementSystemPrompt } from '../prompts/agents/ContextManagement';
import { getTaskDecompositionSystemPrompt } from '../prompts/agents/TaskDecomposition';
import { getTestGenerationSystemPrompt } from '../prompts/agents/TestGeneration';
import { getDocumentationGenerationSystemPrompt } from '../prompts/agents/DocumentationGeneration';
import { getRefactoringSuggestionSystemPrompt } from '../prompts/agents/RefactoringSuggestion';
import { MemoryService } from './MemoryService';

/**
 * System Prompt Factory
 *
 * Generates system prompts for various AI agents.
 * Now uses dependency injection instead of static methods.
 */
export class SystemPromptFactory implements ISystemPromptFactory {
    private static instance: SystemPromptFactory;

    private configService: IConfigService;

    constructor(
        configService?: IConfigService
    ) {
        this.configService = configService || ServiceLocator.getConfigService();
    }

    /**
     * @deprecated Use dependency injection instead
     */
    public static getInstance(): SystemPromptFactory {
        console.warn('[SystemPromptFactory] getInstance() is deprecated. Use DI instead.');
        if (!SystemPromptFactory.instance) {
            SystemPromptFactory.instance = new SystemPromptFactory();
        }
        return SystemPromptFactory.instance;
    }

    /**
     * Internal setter for the singleton instance (used by DI container)
     * @internal
     */
    public static setInstance(instance: SystemPromptFactory): void {
        SystemPromptFactory.instance = instance;
    }

    // ========================================================================
    // Public Methods (implement ISystemPromptFactory)
    // ========================================================================

    public async generate(role: AgentRole, agentName: string, complexity: number = 3, userInput: string = '', contextOptions?: any, seniorIntuition?: string): Promise<string> {
        return this.generateWithOptions({ role, agentName, complexity, userInput, contextOptions, seniorIntuition });
    }

    public async generateWithOptions(options: GenerateOptions): Promise<string> {
        const { role, agentName, complexity = 3, contextOptions, seniorIntuition } = options;

        const memory = MemoryService.getInstance(); // Will be migrated separately
        const userPrefs = await memory.getPreferences();

        // Dynamic Language Detection
        const targetLanguage = this.configService.getUserLanguage();
        const thinkingLang = this.configService.getThinkingLanguage();
        const cwd = this.configService.getWorkspacePath();

        console.log(`[SystemPromptFactory] Tiered Prompt Generation - Role: ${role}, Agent: ${agentName}`);

        // [Tier 1: Global] - Standard Principles & Rules (Loaded via agents/prompts/*)
        // [Tier 2: User] - Preferences
        // [Tier 3: Project] - Guidelines (AGENT.md - handled within agent specific prompts for now)
        // [Tier 4: Agent] - Identity & Tools
        // [Tier 5: Dynamic] - History & Payload (Handled by the Agent Loop, NOT here)

        const projectContext = ""; // Removed pre-injected map to protect cache.

        console.log('[SystemPromptFactory] Step 3: Preparing Base Prompt');
        const basePrompt = `You are ${agentName}, a specialized AI assistant in the Viper ecosystem.`;
        const agentList = this.getAgentDescriptions();

        // Role-based prompt generation
        let roleInstruction = '';
        let collaborationInstruction = '';

        console.log(`[SystemPromptFactory] Step 4: Switch Role (${role})`);
        switch(role) {
            case 'router': // Orchestrator
                console.log('[SystemPromptFactory] Step 4a: Router Config Loading');
                const routerAgents = this.configService.getInternalAgents().filter((a: any) => a.name !== 'OrchestratorAgent');
                console.log(`[SystemPromptFactory] Router Agents Found: ${routerAgents.length} -> ${routerAgents.map((a: any) => a.name).join(', ')}`);
                const routerAgentList = routerAgents.map((a: any) => a.name);
                const routerAgentDescriptions = routerAgents.map((a: any) => `- **${a.name}**: ${a.description}`).join('\n');
                const p = getOrchestratorSystemPrompt({
                    agentName: 'OrchestratorAgent',
                    agentList: routerAgentList,
                    agentDescriptions: routerAgentDescriptions,
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    cwd
                });

                console.log('[SystemPromptFactory] Step 4c: Orchestrator Prompt Generated');
                return p;

            case 'pm': // TaskDecomposition
                return getTaskDecompositionSystemPrompt({
                    agentName,
                    agentList: this.configService.getInternalAgents().map((a: any) => a.name),
                    agentDescriptions: this.getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    cwd
                });


            case 'planner': // Brainstorm
            case 'BrainstormAgent': {
                return getBrainstormSystemPrompt({
                    agentName,
                    agentList: this.configService.getInternalAgents().map((a: any) => a.name),
                    agentDescriptions: this.getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    cwd
                });
            }


            case 'CodeEditAgent': {
                return getCodeEditSystemPrompt({
                    agentName,
                    agentList: this.configService.getInternalAgents().map((a: any) => a.name),
                    agentDescriptions: this.getAgentDescriptions(),
                    complexity: 50,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    cwd
                });

            }

            case 'ReadmeGenerationAgent': {
                return getReadmeGenerationSystemPrompt({
                    agentName,
                    agentList: this.configService.getInternalAgents().map((a: any) => a.name),
                    userLang: targetLanguage,
                    complexity,
                    thinkingLang,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    cwd
                });

            }

            case 'BugFixAgent':
            case 'debugger': { // Compatibility
                return getBugFixSystemPrompt({
                    agentName,
                    agentList: this.configService.getInternalAgents().map((a: any) => a.name),
                    agentDescriptions: this.getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    cwd
                });
            }


            case 'ContextManagementAgent': {
                return getContextManagementSystemPrompt({
                    agentName,
                    agentList: this.configService.getInternalAgents().map((a: any) => a.name),
                    agentDescriptions: this.getAgentDescriptions(),
                    userLang: targetLanguage,
                    complexity,
                    thinkingLang,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
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
                    agentList: this.configService.getInternalAgents().map((a: any) => a.name),
                    agentDescriptions: this.getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    cwd
                });


            case 'DocumentationGenerationAgent':
                return getDocumentationGenerationSystemPrompt({
                    agentName,
                    agentList: this.configService.getInternalAgents().map((a: any) => a.name),
                    agentDescriptions: this.getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
                    cwd
                });


            case 'RefactoringSuggestionAgent':
                return getRefactoringSuggestionSystemPrompt({
                    agentName,
                    agentList: this.configService.getInternalAgents().map((a: any) => a.name),
                    agentDescriptions: this.getAgentDescriptions(),
                    complexity,
                    userPrefs: userPrefs || { language: targetLanguage, codingStyle: 'Standard', preferredFrameworks: [] },
                    thinkingLang,
                    userLang: targetLanguage,
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

        // User Preferences Injection
        const preferenceSection = userPrefs ? `
USER PREFERENCES:
- Language: ${userPrefs?.language || targetLanguage}
- Style: ${userPrefs?.codingStyle || 'Standard'}
- Frameworks: ${userPrefs?.preferredFrameworks?.join(', ') || 'N/A'}
` : '';

        // Project Context Injection
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

        // Complexity Control
        const effectiveRoleForComplexity = role;
        const complexitySection = getLegacyComplexityControl(effectiveRoleForComplexity, complexity);

        // Final Assembly
        return [
            basePrompt,
            roleInstruction,
            preferenceSection,
            complexitySection,
            contextSection,
            seniorIntuition ? `## SENIOR INTUITION (Past Experiences)\n${seniorIntuition}` : '',
            collaborationInstruction
        ].filter(Boolean).join('\n\n');
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    public getAgentDescriptions(): string {
        const internalAgents = this.configService.getInternalAgents();
        return internalAgents.map((a: any) => `- **${a.name}**: ${a.description}`).join('\n');
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
    return '';
}
