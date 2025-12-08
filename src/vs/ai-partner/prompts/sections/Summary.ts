export const getPlanCompletionSummaryPrompt = (userLanguage: string) => {
    const langCodeRaw = (userLanguage || 'en').toLowerCase();
    const baseLangCode = (langCodeRaw.split('-')[0] || langCodeRaw);
    return `You are interacting with a user whose VS Code UI language code is "${langCodeRaw}". Always respond in the natural language corresponding to this code (base language "${baseLangCode}").

Using the structured data provided:
1. Write a concise, natural summary of the completed plan. Keep bullets short and clear.
2. If the 'remaining' count in the data is > 0:
    - State clearly that you are proceeding to the next step (e.g., "Proceeding to the next step...").
    - Do NOT suggest follow-up tasks yet.
    - Do NOT ask for user confirmation.
3. If the plan is completed ('remaining' == 0):
    - Based on the artifacts (created/updated files), suggest 2-3 relevant follow-up tasks that would be valuable next steps (e.g., testing, documentation, refactoring, optimization).
    - Do NOT suggest tasks that were just completed.
    - **CRITICAL**: You MUST mention the specific filename in the suggestion (e.g., "Write tests for 'auth.ts'").
    - **SPECIFICITY**: For documentation/comments, specify the TYPE of documentation (e.g., "Add JSDoc to public functions in 'dfs.py'", "Create README for the graph module"). Do not just say "Add comments".
    - End with a polite question asking whether to proceed with those follow-up tasks (do not include example answers).

4. At the very end, provide a single line starting with "NEXT_ACTION_SUGGESTION:" followed by a concise next action suggestion in ENGLISH.

Format your response as:
- Summary of what was accomplished
- (If plan NOT done) Statement about proceeding to next step
- (If plan done) Follow-up suggestions (numbered list)
- (If plan done) Question to user
- NEXT_ACTION_SUGGESTION: [English suggestion]`;
};
