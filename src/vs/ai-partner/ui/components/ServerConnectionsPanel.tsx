import React, { useState } from 'react';
import { VSCodeButton, VSCodeCheckbox, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';

export const ServerConnectionsPanel: React.FC<{
  state: any;
  setters: any;
  handlers: any;
  vscodeService: any;
}> = ({ state, setters, handlers, vscodeService }) => {
  const { configuredItems, mcpHealthStatus, a2aHealthStatus, mcpEnabledState, expandedServerTools } = state;
  
  // Local UI states
  const [mcpNameInput, setMcpNameInput] = useState('');
  const [mcpCommandInput, setMcpCommandInput] = useState('');
  const [mcpArgsInput, setMcpArgsInput] = useState('');
  const [a2aNameInput, setA2aNameInput] = useState('');
  const [a2aUrlInput, setA2aUrlInput] = useState('');
  const [a2aDescInput, setA2aDescInput] = useState('');
  const [mcpExpanded, setMcpExpanded] = useState(false);
  const [a2aExpanded, setA2aExpanded] = useState(false);

  return (
    <>
      {/* MCP Section */}
      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ marginTop: 0 }}>Model Context Protocol (MCP)</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
                <VSCodeButton appearance="icon" onClick={() => vscodeService.postMessage({ command: 'refreshConfiguredItems', payload: { force: true } })} title="Refresh MCP configs">
                    <span className="codicon codicon-refresh"></span>
                </VSCodeButton>
            </div>
        </div>
        <p>Manage connections to Model Context Protocol settings via <code>.agent/mcp-servers.json</code>.</p>

        {/* Inline Add MCP Server Form */}
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <VSCodeTextField value={mcpNameInput} onInput={(e: any) => setMcpNameInput(e.target.value)} placeholder="MCP Server Name" style={{ width: '100%' }} />
          <VSCodeTextField value={mcpCommandInput} onInput={(e: any) => setMcpCommandInput(e.target.value)} placeholder="Command (e.g., npx @modelcontextprotocol/server-filesystem)" style={{ width: '100%' }} />
          <VSCodeTextField value={mcpArgsInput} onInput={(e: any) => setMcpArgsInput(e.target.value)} placeholder="Args (e.g., /path/to/directory)" style={{ width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <VSCodeButton appearance="primary" onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/mcp-servers.json' })} style={{ height: '28px', width: 'fit-content' }}>
              <span className="codicon codicon-json" style={{ marginRight: '6px' }}></span>
              Open mcp-servers.json
            </VSCodeButton>
            <VSCodeButton
              className="add-button"
              appearance="primary"
              onClick={() => {
                if(handlers.handleAddMcpServer(mcpNameInput, mcpCommandInput, mcpArgsInput)) {
                  setMcpNameInput(''); setMcpCommandInput(''); setMcpArgsInput('');
                }
              }}
              style={{ height: '28px', width: 'fit-content' }}
            >
              <span className="codicon codicon-plus" style={{ marginRight: '4px' }}></span>
              Add MCP Server
            </VSCodeButton>
          </div>
        </div>

        {configuredItems.mcp.length > 0 ? (
          <div style={{ marginTop: '12px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: 0.9, userSelect: 'none' }} onClick={() => setMcpExpanded(!mcpExpanded)}>
                <span className={`codicon codicon-${mcpExpanded ? 'chevron-down' : 'chevron-right'}`}></span>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                  Total: {configuredItems.mcp.length}, Active: {configuredItems.mcp.filter((s: string) => mcpHealthStatus[s]?.status === 'healthy').length}, Inactive: {configuredItems.mcp.filter((s: string) => mcpHealthStatus[s]?.status !== 'healthy').length}
                </span>
             </div>
             {mcpExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '16px', marginTop: '8px', borderLeft: '2px solid var(--vscode-dropdown-border)' }}>
                    {configuredItems.mcp.map((server: string) => {
                        const health = mcpHealthStatus[server] || { status: 'unknown' };
                        const iconClass = health.status === 'healthy' ? 'codicon-check' : health.status === 'unhealthy' ? 'codicon-error' : 'codicon-question';
                        const iconColor = health.status === 'healthy' ? 'var(--vscode-testing-iconPassed)' : health.status === 'unhealthy' ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-testing-iconSkipped)';
                        const statusText = health.status === 'healthy' ? 'Ready' : health.status === 'unhealthy' ? 'Error' : 'Unknown';
                        const hasTools = health.status === 'healthy' && Array.isArray(health.tools);
                        return (
                            <div key={server} style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                                  <div style={{ marginRight: '8px' }} onClick={(e) => e.stopPropagation()}>
                                      <VSCodeCheckbox 
                                          checked={mcpEnabledState.servers[server] !== false}
                                          onChange={() => handlers.toggleServerEnabled(server, mcpEnabledState.servers[server] !== false)} 
                                          title={mcpEnabledState.servers[server] !== false ? "Disable Server" : "Enable Server"}
                                      />
                                  </div>
                                  <span className={`codicon ${iconClass}`} style={{ fontSize: '12px', marginRight: '6px', color: iconColor }} title={health.message || statusText}></span>
                                  <span style={{ opacity: mcpEnabledState.servers[server] !== false ? 1 : 0.5 }}>{server}</span>
                                  <span style={{ fontSize: '11px', opacity: 0.6, marginLeft: '8px' }}>({statusText})</span>
                                  {health.message && health.status === 'unhealthy' && <span style={{ fontSize: '11px', opacity: 0.8, marginLeft: '8px', color: 'var(--vscode-errorForeground)' }}>- {health.message}</span>}
                                  {hasTools && (
                                      <div onClick={() => setters.setExpandedServerTools((prev: any) => ({ ...prev, [server]: !prev[server] }))} style={{ marginLeft: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.8, fontSize: '11px' }} title="View Tools">
                                          <span style={{ marginRight: '4px' }}>{health.tools?.length} tools</span>
                                          <span className={`codicon codicon-${expandedServerTools[server] ? 'chevron-down' : 'chevron-right'}`}></span>
                                      </div>
                                  )}
                              </div>
                              {hasTools && expandedServerTools[server] && (
                                  <div style={{ margin: '4px 0 8px 46px', fontSize: '12px', opacity: 0.9, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      {health.tools?.map((tool: string) => (
                                          <div key={tool} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <VSCodeCheckbox 
                                                  checked={mcpEnabledState.tools[server]?.[tool] !== false}
                                                  onChange={() => handlers.toggleToolEnabled(server, tool, mcpEnabledState.tools[server]?.[tool] !== false)}
                                                  disabled={mcpEnabledState.servers[server] === false}
                                              />
                                              <span style={{ opacity: (mcpEnabledState.tools[server]?.[tool] !== false && mcpEnabledState.servers[server] !== false) ? 1 : 0.5 }}>{tool}</span>
                                          </div>
                                      ))}
                                  </div>
                              )}
                            </div>
                        );
                    })}
                </div>
             )}
          </div>
        ) : <div style={{ fontSize: '13px', opacity: 0.7, marginTop: '12px' }}>No MCP servers configured.</div>}
      </div>

      {/* A2A Section */}
      <div className="settings-section" style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ marginTop: 0 }}>Agents to Agents (A2A)</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
                <VSCodeButton appearance="icon" onClick={() => vscodeService.postMessage({ command: 'refreshConfiguredItems', payload: { force: true } })} title="Refresh A2A configs">
                    <span className="codicon codicon-refresh"></span>
                </VSCodeButton>
            </div>
        </div>
        <p>Manage Agent-to-Agent (A2A) configurations via <code>.agent/a2a-servers.json</code>.</p>

        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <VSCodeTextField value={a2aNameInput} onInput={(e: any) => setA2aNameInput(e.target.value)} placeholder="A2A Agent Name" style={{ width: '100%' }} />
          <VSCodeTextField value={a2aUrlInput} onInput={(e: any) => setA2aUrlInput(e.target.value)} placeholder="URL (e.g., http://localhost:8000/agent/foo/card)" style={{ width: '100%' }} />
          <VSCodeTextField value={a2aDescInput} onInput={(e: any) => setA2aDescInput(e.target.value)} placeholder="Description" style={{ width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <VSCodeButton appearance="primary" onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/a2a-servers.json' })} style={{ height: '28px', width: 'fit-content' }}>
              <span className="codicon codicon-json" style={{ marginRight: '6px' }}></span>
              Open a2a-servers.json
            </VSCodeButton>
            <VSCodeButton
              className="add-button"
              appearance="primary"
              onClick={() => {
                if(handlers.handleAddA2aServer(a2aNameInput, a2aUrlInput)) {
                  setA2aNameInput(''); setA2aUrlInput(''); setA2aDescInput('');
                }
              }}
              style={{ height: '28px', width: 'fit-content' }}
            >
              <span className="codicon codicon-plus" style={{ marginRight: '4px' }}></span>
              Add A2A Server
            </VSCodeButton>
          </div>
        </div>

        {configuredItems.a2a.filter((a: string) => a !== 'SecurityAnalysisAgent').length > 0 ? (
          <div style={{ marginTop: '12px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: 0.9, userSelect: 'none' }} onClick={() => setA2aExpanded(!a2aExpanded)}>
                <span className={`codicon codicon-${a2aExpanded ? 'chevron-down' : 'chevron-right'}`}></span>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                  Total: {configuredItems.a2a.filter((a: string) => a !== 'SecurityAnalysisAgent').length}, Connected: {configuredItems.a2a.filter((s: string) => s !== 'SecurityAnalysisAgent' && a2aHealthStatus[s]?.status === 'healthy').length}, Disconnected: {configuredItems.a2a.filter((s: string) => s !== 'SecurityAnalysisAgent' && a2aHealthStatus[s]?.status !== 'healthy').length}
                </span>
             </div>
             {a2aExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '16px', marginTop: '8px', borderLeft: '2px solid var(--vscode-dropdown-border)' }}>
                    {configuredItems.a2a.map((agent: string) => {
                        const health = a2aHealthStatus[agent] || { status: 'unknown' };
                        const iconClass = health.status === 'healthy' ? 'codicon-radio-tower' : health.status === 'unhealthy' ? 'codicon-error' : 'codicon-question';
                        const iconColor = health.status === 'healthy' ? 'var(--vscode-testing-iconPassed)' : health.status === 'unhealthy' ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-testing-iconSkipped)';
                        const statusText = health.status === 'healthy' ? 'Connected' : health.status === 'unhealthy' ? 'Disconnected' : 'Unknown';
                        return (
                            <div key={agent} style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                                <span className={`codicon ${iconClass}`} style={{ fontSize: '12px', marginRight: '6px', color: iconColor }} title={health.message || statusText}></span>
                                <span>{agent}</span>
                                <span style={{ fontSize: '11px', opacity: 0.6, marginLeft: '8px' }}>({statusText})</span>
                                {health.message && health.status === 'unhealthy' && <span style={{ fontSize: '11px', opacity: 0.8, marginLeft: '8px', color: 'var(--vscode-errorForeground)' }}>- {health.message}</span>}
                            </div>
                        );
                    })}
                </div>
             )}
          </div>
        ) : <div style={{ fontSize: '13px', opacity: 0.7, marginTop: '12px' }}>No Agent to Agent configured.</div>}
      </div>
    </>
  );
};
