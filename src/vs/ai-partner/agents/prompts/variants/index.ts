import { PromptRegistry } from '../registry/PromptRegistry';
import { ConversationalVariant } from '../variants/conversational/config';

export const registerVariants = (registry: PromptRegistry) => {
    registry.register(ConversationalVariant);
};
