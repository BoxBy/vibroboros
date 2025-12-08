import { SystemPromptContext } from '../types';

/**
 * Agent role and identity component
 */
export function buildAgentRoleSection(context: SystemPromptContext): string {
    const localeNote = context.locale !== 'en' 
        ? `\n\n**Language**: Always respond in the natural language corresponding to the VS Code UI language code "${context.ideLanguage}" (base language "${context.locale}"). Do not mix languages or add language-specific instructions in individual prompts.`
        : '';
    
    return `You are Viper, an expert coding partner.${localeNote}`;
}

