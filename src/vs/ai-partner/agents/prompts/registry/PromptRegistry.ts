import { SystemPromptContext, PromptVariant } from '../types';

export class PromptRegistry {
    private variants: PromptVariant[] = [];

    register(variant: PromptVariant) {
        this.variants.push(variant);
    }

    getVariant(context: SystemPromptContext): PromptVariant | undefined {
        // Find the first variant that matches the context
        // In a real implementation, we might want a priority system or more specific matching
        return this.variants.find(v => v.matcher(context));
    }
}

export const promptRegistry = new PromptRegistry();
