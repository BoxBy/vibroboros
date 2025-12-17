export function getComplexityControl(complexity: number, levels: string[]): string {
    return `<!-- COMPLEXITY CONTROL -->
## COMPLEXITY CONTROL
- **Target Level**: ${complexity} (0-100)
- **Execution Strategy by Level**:
${levels.map((lvl) => `  ${lvl}`).join('\n')}`;
}
