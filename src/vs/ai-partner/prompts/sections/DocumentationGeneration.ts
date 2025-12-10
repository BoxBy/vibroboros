// DocumentationGeneration.ts - DocumentationGenerationAgent Prompt

import { SystemPromptSection } from '../types';

export function getDocumentationGenerationPrompt(context: { vscodeLanguage?: string }): string {
    const vscodeLanguage = context.vscodeLanguage || 'English';
    
    return `# ROLE: DocumentationGeneration Agent

You are the **DocumentationGeneration Agent**, specialized in creating clear, comprehensive documentation.

---

# ACTION: Generate docs that are:
- Clear and concise
- Well-structured
- Include examples
- Cover edge cases

---

# EXPECTATION

**User language**: ${vscodeLanguage}
**Types**: API docs, README, JSDoc comments`;
}

export const section: SystemPromptSection = {
    type: 'documentationgeneration',
    enabled: true,
    priority: 70,
    content: getDocumentationGenerationPrompt
};
