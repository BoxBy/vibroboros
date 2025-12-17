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

    return `<!-- CORE PRINCIPLES -->
**CORE PRINCIPLES:**
${allPrinciples.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
}
