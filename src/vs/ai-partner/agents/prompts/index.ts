import { LlmMessage } from '../../services/LLMService';
import { SystemPromptContext, SystemPromptSection } from './types';
import { promptRegistry } from './registry/PromptRegistry';
import { PromptBuilder } from './registry/PromptBuilder';
import { registerVariants } from './variants';
import * as components from './components';
import { getTaskTypePrompt, getPlanPrompt, getBugFixProcessPrompt, getRoutingPrompt, getPostActionsSelectionPrompt, getSeniorEngineerThinkingPrompt, getRobustToolUsePrompt, getSecuritySanitizationPrompt, getPlanCompletionSummaryPrompt } from '../LegacyPrompts';

// Initialize system
registerVariants(promptRegistry);
const promptBuilder = new PromptBuilder(components.componentRegistry);

export const getConversationalPrompt = async (
    userText: string, 
    conversationHistory?: LlmMessage[], 
    availableTools?: any[],
    contextOverrides?: Partial<{
        provider: any;
        model: string;
        locale: string;
        ideLanguage: string;
        mcpEnabled: boolean;
        workspaceRoots: string[];
        uroborosMode: boolean;
    }>
) => {
    // Build context
    const workspaceRoots = contextOverrides?.workspaceRoots || [process.cwd()];
    const cwd = workspaceRoots[0] || process.cwd();
    
    const context: SystemPromptContext = {
        os: process.platform,
        cwd: cwd,
        locale: contextOverrides?.locale || 'en',
        modelFamily: 'generic', // TODO: Detect from model name
        capabilities: {
            mcpEnabled: contextOverrides?.mcpEnabled ?? true,
            browserEnabled: false,
            commandExecutionEnabled: true
        },
        availableTools
    };

    const variant = promptRegistry.getVariant(context);
    if (!variant) {
        // Fallback to legacy if no variant found (though we registered a default)
        console.warn('No prompt variant found, falling back to legacy');
        const { getConversationalPrompt: legacyPrompt } = require('../LegacyPrompts');
        return legacyPrompt(userText, conversationHistory, availableTools);
    }

    let prompt = await promptBuilder.build(variant, context);

    // Dynamic replacements
    const contextSection = conversationHistory && conversationHistory.length > 0
        ? `\n\n**Previous Conversation Context (last ${Math.min(conversationHistory.length, 10)} messages):**\n${conversationHistory.slice(-10).map((msg) => {
            const role = msg.role === 'user' ? 'User' : (msg.role === 'assistant' ? 'Assistant' : 'System');
            const content = typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content.map((c: any) => typeof c === 'string' ? c : c?.text || '').join('') : JSON.stringify(msg.content));
            return `${role}: ${content}`;
        }).join('\n\n')}`
        : '';

    prompt = prompt.replace('{{USER_INPUT}}', userText);
    prompt = prompt.replace('{{CONTEXT_SECTION}}', contextSection);

    return prompt;
};

// Re-export legacy functions
export {
    getTaskTypePrompt,
    getPlanPrompt,
    getBugFixProcessPrompt,
    getRoutingPrompt,
    getPostActionsSelectionPrompt,
    getSeniorEngineerThinkingPrompt,
    getRobustToolUsePrompt,
    getSecuritySanitizationPrompt,
    getPlanCompletionSummaryPrompt
};
