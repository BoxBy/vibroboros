import { PromptVariant, SystemPromptContext, SystemPromptSection, PromptComponent } from '../types';

export class PromptBuilder {
    constructor(private componentRegistry: Record<SystemPromptSection, PromptComponent>) {}

    async build(variant: PromptVariant, context: SystemPromptContext): Promise<string> {
        let prompt = variant.baseTemplate;

        // Build each component in order
        for (const section of variant.componentOrder) {
            const component = this.componentRegistry[section];
            if (!component) {
                console.warn(`[PromptBuilder] Component for section ${section} not found`);
                continue;
            }

            const content = component(context);
            const placeholder = `{{${section}}}`;
            prompt = prompt.replace(placeholder, content);
        }

        // Replace any remaining placeholders with empty string
        prompt = prompt.replace(/\{\{[A-Z_]+\}\}/g, '');

        return prompt;
    }
}
