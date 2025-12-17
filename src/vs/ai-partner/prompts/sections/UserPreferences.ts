export interface UserPrefsOptions {
    language: string;
    codingStyle: string;
    preferredFrameworks: string[];
}

export function getUserPreferences(prefs: UserPrefsOptions): string {
    return `<!-- USER PREFERENCES -->
**USER PREFERENCES:**
- **Language**: ${prefs.language}
- **Style**: ${prefs.codingStyle}
- **Frameworks**: ${prefs.preferredFrameworks.join(', ')}`;
}

export function getUserCustomRules(): string {
    return `<!-- USER CUSTOM RULES (AGENT.md) -->
## USER CUSTOM RULES (AGENT.md)
[Agent Rules Placeholder - Injected by System if AGENT.md exists]`;
}
