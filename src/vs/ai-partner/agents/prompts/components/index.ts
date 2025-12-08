import { SystemPromptSection, SystemPromptContext, PromptComponent } from '../types';
import { AgentRole } from './AgentRole';
import { buildRulesSection } from './rules';
import { ToolUse } from './ToolUse';
import { Objective } from './objective';
import { SystemInfo } from './SystemInfo';

/**
 * Component registry mapping SystemPromptSection to component functions
 */
export const componentRegistry: Record<SystemPromptSection, PromptComponent> = {
    [SystemPromptSection.AGENT_ROLE]: AgentRole,
    [SystemPromptSection.RULES]: buildRulesSection,
    [SystemPromptSection.TOOL_USE]: ToolUse,
    [SystemPromptSection.OBJECTIVE]: Objective,
    [SystemPromptSection.SYSTEM_INFO]: SystemInfo,
    [SystemPromptSection.MCP_INFO]: (context: SystemPromptContext) => {
        if (!context.capabilities.mcpEnabled) return '';
        return `**MCP (Model Context Protocol)**: Enabled\n- You have access to MCP tools for file operations, directory operations, and information retrieval.\n- Use MCP tools via function calling (tool_calls) when appropriate.`;
    },
    [SystemPromptSection.USER_INSTRUCTIONS]: (context: SystemPromptContext) => {
        return ''; // Handled dynamically in PromptBuilder
    },
};

// Also export individual components for direct use
export { AgentRole, buildRulesSection, ToolUse, Objective, SystemInfo };
