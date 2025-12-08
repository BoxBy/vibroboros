import { SystemPromptContext } from '../types';

export const AgentRole = (context: SystemPromptContext) => {
    const localeNote = context.locale !== 'en' 
        ? `\n\n**Language**: Always respond in the natural language corresponding to the VS Code UI language code. Do not mix languages or add language-specific instructions in individual prompts.`
        : '';
    
    return `You are Viper, an expert coding partner.${localeNote}`;
};
