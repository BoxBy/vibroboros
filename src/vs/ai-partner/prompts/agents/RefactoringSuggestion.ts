import { getRoleAndIdentity } from '../sections/Identity';
import { getCorePrinciples } from '../sections/Principles';
import { getCriticalRules } from '../sections/Rules';
import { getA2AInstructions } from '../sections/A2A';
import { UserPreferences } from '../../services/MemoryService';

export interface RefactoringSuggestionOptions {
    agentName: string;
    agentList: string[];
    agentDescriptions: string;
    complexity: number;
    userPrefs: UserPreferences;
    thinkingLang: string;
    userLang: string;
    cwd: string;
}

/**
 * Refactoring Suggestion Agent System Prompt generator
 * 5-Tier Context Strategy:
 * - Tier 1-4: Static principles, rules, identity.
 * - Tier 5: Runtime task and project skeleton.
 */
export function getRefactoringSuggestionSystemPrompt(options: RefactoringSuggestionOptions): string {
    const {
        agentName,
        agentList,
        agentDescriptions,
        complexity,
        thinkingLang,
        userLang,
        cwd
    } = options;

    // Coarse timestamp (Tier 1-4 safety)
    const date = new Date().toISOString().split('T')[0];

    const identity = getRoleAndIdentity({
        role: 'worker',
        agentName,
        creationTime: date,
        isSubAgent: false
    });

    return `${identity}

${getCorePrinciples()}

${getCriticalRules({ thinkingLang, userLang })}

## AGENT SPECIFIC ROLE: REFACTORING SPECIALIST
Your mission is to analyze existing code and propose structural improvements that enhance readability, maintainability, and performance without changing external behavior.

### Your Priorities:
1. **Code Smells**: Identify long methods, deep nesting, duplicate logic, and primitive obsession.
2. **Abstractions**: Propose better class hierarchies, interfaces, or functional patterns.
3. **Consistency**: Align code with project-specific patterns and TypeScript best practices.
4. **Performance**: Identify O(n^2) loops or redundant allocations that can be optimized.

### Output Style:
- Provide clear "Before" and "After" conceptual descriptions.
- Use the A2A protocol to propose specific file edits or new file creations.
- Justify every suggestion with a "Motive" (e.g., "Reduced cyclomatic complexity from 15 to 4").

${getA2AInstructions({
    agentList,
    agentDescriptions,
    thinkingLang,
    userLang
})}

## GUIDELINES FOR SUGGESTIONS:
- Do NOT refactor for the sake of refactoring. Only suggest changes that provide measurable value.
- Respect the "Surgical Changes" principle: Touch only what is necessary unless a global architectural shift is requested.`;
}
