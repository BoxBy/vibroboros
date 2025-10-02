import React, { useState, useEffect } from 'react';
import { VSCodeButton, VSCodeDivider } from '@vscode/webview-ui-toolkit/react';
import { vscodeService } from './services/vscode';

// Define the structure of an agent based on a2a-servers.json
interface Agent {
  path: string;
  card: {
    name: string;
    description: string;
    // Add other card properties if needed for display
  };
}

export const SettingsPage: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'updateAgentList') {
        setAgents(message.agents);
      }
    };

    window.addEventListener('message', handleMessage);

    // Request initial list on component mount
    // This is a bit of a hack. A better way would be for the extension to send it when the view is ready.
    // But since the extension now sends it on activation, this might not be needed.

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleRemoveAgent = (agentName: string) => {
    vscodeService.postMessage({ command: 'removeAgent', agentName });
  };

  const handleAddAgent = () => {
    // For now, adds a placeholder agent. A form should be implemented later.
    const newAgent: Agent = {
      path: "./agents/NewAgent.ts",
      card: {
        name: "NewAgent",
        description: "A newly added agent.",
      }
    };
    vscodeService.postMessage({ command: 'addAgent', agent: newAgent });
  };

  return (
    <div className="settings-page-container">
      <div className="settings-section">
        <h3>MCP Connectors</h3>
        <p>Manage your connections to Multi-Agent Communication Protocol (MCP) servers.</p>
        <VSCodeButton>Add MCP Connector</VSCodeButton>
      </div>

      <VSCodeDivider />

      <div className="settings-section">
        <h3>A2A Agents</h3>
        <p>Manage the Agent-to-Agent (A2A) agents available in this workspace.</p>
        <div className="agent-list">
          {agents.map(agent => (
            <div key={agent.card.name} className="agent-item">
              <div className="agent-info">
                <strong>{agent.card.name}</strong>
                <p>{agent.card.description}</p>
              </div>
              <VSCodeButton appearance="secondary" onClick={() => handleRemoveAgent(agent.card.name)}>
                Remove
              </VSCodeButton>
            </div>
          ))}
        </div>
        <VSCodeButton onClick={handleAddAgent}>Add Agent</VSCodeButton>
      </div>

      {/* Future settings sections can be added here */}
    </div>
  );
};