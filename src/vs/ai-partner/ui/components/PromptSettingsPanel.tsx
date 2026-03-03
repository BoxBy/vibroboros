import React from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

export const PromptSettingsPanel: React.FC<{
  state: any;
  setters: any;
  vscodeService: any;
}> = ({ state, setters, vscodeService }) => {
  const { configuredItems, expandedPrompts } = state;

  const togglePrompt = (agentName: string) => {
    setters.setExpandedPrompts((prev: any) => ({ ...prev, [agentName]: !prev[agentName] }));
  };

  return (
    <div className="settings-section" style={{ marginTop: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ marginTop: 0 }}>Prompt Settings</h3>
          <div style={{ display: 'flex', gap: '4px' }}>
              <VSCodeButton appearance="icon" onClick={() => vscodeService.postMessage({ command: 'refreshConfiguredItems', payload: { force: true } })} title="Refresh Prompt configs">
                  <span className="codicon codicon-refresh"></span>
              </VSCodeButton>
          </div>
      </div>
      <p>Manage custom prompts via <code>.agent/AGENTS.md</code>.</p>
      
      <div style={{ marginTop: '12px' }}>
        <VSCodeButton appearance="primary" onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/AGENTS.md' })} style={{ height: '28px', width: 'fit-content', marginBottom: '12px' }}>
          <span className="codicon codicon-markdown" style={{ marginRight: '6px' }}></span>
          Open AGENTS.md
        </VSCodeButton>
        
        {configuredItems.prompts.length > 0 ? (
          <div>
             {configuredItems.prompts.map((agent: any) => (
               <div key={agent.name} style={{ marginBottom: '8px' }}>
                 <div 
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.9, cursor: 'pointer', userSelect: 'none' }}
                   onClick={() => togglePrompt(agent.name)}
                 >
                    <span className={`codicon codicon-${expandedPrompts[agent.name] ? 'chevron-down' : 'chevron-right'}`}></span>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{agent.name}</span>
                 </div>
                 {expandedPrompts[agent.name] && (
                     <div style={{ marginTop: '8px', paddingLeft: '16px', borderLeft: '2px solid var(--vscode-dropdown-border)' }}>
                         <pre style={{ 
                             fontSize: '12px', whiteSpace: 'pre-wrap', backgroundColor: 'var(--vscode-editor-background)', 
                             padding: '8px', borderRadius: '4px', margin: 0, fontFamily: 'var(--vscode-editor-font-family)'
                         }}>
                             {agent.content || '(No specific guidelines)'}
                         </pre>
                     </div>
                 )}
               </div>
             ))}
          </div>
        ) : <div style={{ fontSize: '13px', opacity: 0.7 }}>No prompt configurations found.</div>}
      </div>
    </div>
  );
};
