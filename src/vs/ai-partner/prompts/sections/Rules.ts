export interface CriticalRulesOptions {
    thinkingLang: string;
    userLang: string;
    customRules?: string[]; // Extra rules
}

export function getCriticalRules(options: CriticalRulesOptions): string {
    const { thinkingLang, userLang, customRules = [] } = options;

    const baseRules = [
        `**Internal Thoughts**: Use **${thinkingLang}**.`,
        `**User Language**: Always respond in **${userLang}**.`,
        `**Error Handling**: If a tool fails, **Analyze** the error, **Fix** the path/argument, and **Retry**.`
    ];

    const allRules = [...baseRules, ...customRules];

    return `<!-- CRITICAL RULES -->
**CRITICAL RULES:**
${allRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
}
