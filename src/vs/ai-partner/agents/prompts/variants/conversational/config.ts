import { PromptVariant, SystemPromptSection } from '../../types';
import { CONVERSATIONAL_TEMPLATE } from './template';

export const ConversationalVariant: PromptVariant = {
    id: 'conversational-generic-v1',
    description: 'Generic conversational prompt for all models',
    matcher: () => true, // Default match for now
    baseTemplate: CONVERSATIONAL_TEMPLATE,
    componentOrder: [
        SystemPromptSection.AGENT_ROLE,
        SystemPromptSection.SYSTEM_INFO,
        SystemPromptSection.RULES,
        SystemPromptSection.TOOL_USE,
        SystemPromptSection.OBJECTIVE
    ]
};
