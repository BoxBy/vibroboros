export const STANDARD_COMPLEXITY_LEVELS = [
    "**Complexity Control (System Standard)**:",
    "- **Level 10-30 (Easy): Immediate Execution**.",
    "  - *Strategy*: Atomic task. Execute immediately.",
    "  - *Routing*: **CodeEditAgent** (Simple Edit), **BugFixAgent** (Obvious Fix), or **Direct Answer**.",
    "- **Level 40-60 (Medium): Sequential Decomposition**.",
    "  - *Strategy*: Decompose into atomic tasks (Lv 10-20) -> Execute sequentially.",
    "  - *Routing*: **TaskDecompositionAgent** (Breakdown) -> **CodeEditAgent** (Execution).",
    "- **Level 70-90 (Hard): Planning & Iteration**.",
    "  - *Strategy*: Plan (Step Lv ≤ 50) -> Decompose Plan to Tasks (Lv 1-20) -> Execute -> Iterate.",
    "  - *Routing*: **BrainstormAgent** (Planning) -> **TaskDecompositionAgent** (Mgmt) -> **Worker**.",
    "- **Level 100+ (Project): Uroboros Mode**.",
    "  - *Strategy*: **Propose Uroboros Mode** for architectural changes.",
    "  - *Flow (Accepted)*: Interactive Brainstorming until ALL plan steps are Lv ≤ 30 -> Execute.",
    "  - *Flow (Rejected)*: Fallback to 'Hard' mode with **Strictly Detailed Planning**."
];

export function getComplexityMatrix(): string {
    return `### V3 COMPLEXITY SCORING MATRIX (Professional Engineering Standard)
1. **Base Score (Project Nature)**:
   - Atomic Script: 10 / Application: 30 / System (Viper): 50 / Framework: 80 / Low-level: 110.
2. **Additives (Cognitive Load)**:
   - **Volume**: +10 (5+ files) / +30 (20+ files).
   - **Side-Effect**: +20 (Local Utility) / +40 (Core Architectural modification).
   - **Task Nature**: +50 (Root Cause Analysis/Debugging) / +40 (New Feature Design).
   - **Legacy/Debt**: +20 (Undocumented/Legacy logic).
3. **Minus Factors (Efficiency)**:
   - **Existing Pattern**: -20 (Same logic exists nearby).
   - **User Guide**: -30 (Detailed implementation guide provided).
   - **High Testability**: -15 (Minimal mocks required).
4. **Safety Multipliers**:
   - **Finance/Security/Core**: x1.5 / **Irreversible/Destructive**: x1.3.

**Calculated Complexity (Base + Additives - Deductions) * Multipliers.**`;
}

export function getComplexityControl(complexity: number, matrix: string = getComplexityMatrix()): string {
    return `<!-- COMPLEXITY CONTROL -->
## COMPLEXITY CONTROL
- **Target Level**: ${complexity} (0-100)
- **Execution Strategy by Level**:
${STANDARD_COMPLEXITY_LEVELS.map((lvl) => `  ${lvl}`).join('\n')}

${matrix}
`;
}
