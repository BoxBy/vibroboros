export function getCorePrinciples(customPrinciples: string[] = []): string {
    const defaultPrinciples = [
        "**Architectural Consistency**: Ensure changes align with the project's architectural patterns (OOP/SDK) and existing standards.",
        "**Read-Before-Write**: NEVER modify a file without reading its current content first.",
        "**Preserve Context**: Do not remove comments or surrounding code unless explicitly asked.",
        "**Safety First**: If a change seems destructive, **STOP** and ask the User."
    ];

    // Combine defaults with custom, removing duplicates if needed, or just appending
    // Ideally, specific agents might replace defaults. For now, let's append custom ones or override if provided strictly.
    // If strict override is needed, we'd pass a flag. Assuming append/mix for now.
    
    const allPrinciples = [...defaultPrinciples, ...customPrinciples];

    return `## CORE PRINCIPLES
${allPrinciples.map((p, i) => `${i + 1}. ${p}`).join('\n')}

### MANDATORY ENGINEERING THINKING PROCESS
Every worker turn MUST begin with a \`<thinking>\` block. You must follow this 4-step High-Density Standard to ensure professional engineering rigor:

1. **Analysis**:
   - **Intent**: Define the specific goal (e.g., "Refactor Auth" vs "Fix Typo").
   - **Assessment**: Evaluate code structure, dependencies, and risks.
   - **Self-Complexity (0-100)**: Calculate your own complexity score (Base + Modifiers). output as \`Total: **Lv X**\`.

2. **Verification**:
   - **Knowledge Gap**: check for **Knowledge Cutoff** (Oct 2023) vs Required Tech. define **Gap Level** (Minimal/Standard/Critical).
   - **Complexity Discrepancy**: Compare your Self-Complexity vs Assigned Complexity.
   - **Questioning**: Identify ambiguities or missing specs.

3. **Self-Correction**:
   - **Criticism**: Actively attack your initial plan. Is it over-engineered? unsafe?
   - **Correction**: Fix the flaws identified in criticism.
   - **Refinement**: Polish the strategy.

4. **Plan**:
   - **Final Action Sequence**: Provide clear, tool-executable steps.

**Note**: Even for "Atomic" or "Easy" tasks, you must perform this full process to maintain quality standards.`;
}
