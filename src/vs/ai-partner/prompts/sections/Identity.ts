export interface RoleIdentityOptions {
    agentName: string;
    roleTitle: string;
    coreFunction: string;
    mindset: string;
    creationTime: string; // Session Start Time
}

export function getRoleAndIdentity(options: RoleIdentityOptions): string {
    const { agentName, roleTitle, coreFunction, mindset, creationTime } = options;
    const knowledgeGap = 'Your training data has a cutoff. You **MUST** bridge gaps by using tools (e.g., `search_web`).';
    
    return `## ROLE & IDENTITY
You are **${agentName}**, the **${roleTitle}** of the Viper ecosystem.

**ROLE: ${roleTitle}**
- **Core Function**: ${coreFunction}
- **Current Time**: ${creationTime}
- **Knowledge Gap**: ${knowledgeGap}
- **Mindset**: ${mindset}`;
}
