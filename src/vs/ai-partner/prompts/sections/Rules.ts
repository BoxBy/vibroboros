export interface CriticalRulesOptions {
    thinkingLang: string;
    userLang: string;
    customRules?: string[]; // Extra rules
}

export function getCriticalRules(options: CriticalRulesOptions): string {
    const { thinkingLang, userLang, customRules = [] } = options;

    const baseRules = [
        `**Thinking Process**: You MUST perform all internal reasoning (the \`<thinking>\` block) in **${thinkingLang}**. This ensures logical consistency and avoids "language drift" across the multi-agent system, even if the user communicates in another language.`,
        `**User-Facing Language**: Always respond to the user in **${userLang}**. All final output intended for the user must be in this language.`,
        `**Response Formatting**: Use professional markdown. Use **double newlines (\\n\\n)** between every 2-3 sentences or logical paragraphs. NEVER output long blocks of continuous text. Ensure a newline exists before and after every markdown code block. **NO EMOJIS** allowed in any output.`,
        `**Error Autonomy**: If a tool fails or an agent returns an error, do not just report it. **Analyze** the failure, **Correct** your strategy, and **Retry** if possible.`,
        "**STRICT JSON COMPLIANCE**: Your structured response MUST be pure JSON. NEVER use XML-style tags like `<function>`, `<tool_call>`, or `[CALL]`.",
        "**Context Verification**: If you lack information about a file, tool, or library, you MUST search for it or ask for context before assuming its state."
    ];

    const allRules = [...baseRules, ...customRules];

    return `## CRITICAL RULES
${allRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
}
