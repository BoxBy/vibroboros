export interface RoleIdentityOptions {
    agentName: string;
    roleTitle: string;
    coreFunction: string;
    mindset: string;
    creationTime: string; // Session Start Time
    isSubAgent?: boolean; // New: For sub-agent identity
}


export function getRoleAndIdentity(options: RoleIdentityOptions): string {
    const { agentName, roleTitle, coreFunction, mindset, creationTime, isSubAgent } = options;
    const knowledgeGap = 'Your training data has a cutoff. You **MUST** bridge gaps by using tools (e.g., `search_web`).';
    
    let identity = `## ROLE & IDENTITY
You are **${agentName}**, the **${roleTitle}** of the Viper ecosystem.

**ROLE: ${roleTitle}**
- **Core Function**: ${coreFunction}
- **Current Time**: ${creationTime} (Coarse)
- **Knowledge Gap**: ${knowledgeGap}
- **Mindset**: ${isSubAgent ? '**Focused Execution**. You are a dynamically spawned specialist. Stay within your assigned scope.' : mindset}`;

    return identity;
}

