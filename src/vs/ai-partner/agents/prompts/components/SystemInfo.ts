import { SystemPromptContext } from '../types';

export const SystemInfo = (context: SystemPromptContext) => {
    const parts = [];
    parts.push(`Operating System: ${context.os}`);
    parts.push(`Current Working Directory (CWD): ${context.cwd}`);
    parts.push(`Locale: ${context.locale}`);
    
    if (context.activeTerminals && context.activeTerminals.length > 0) {
        parts.push(`Active Terminals: ${context.activeTerminals.join(', ')}`);
    }

    return parts.join('\n');
};
