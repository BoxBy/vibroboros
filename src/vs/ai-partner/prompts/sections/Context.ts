export function getProjectContext(context: string = "[...Smart Context Injection...]"): string {
    return `<!-- PROJECT CONTEXT -->
**PROJECT CONTEXT:**
${context}`;
}
