import React, { useState } from 'react';
import { vscodeService } from '../services/vscode';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

interface TerminalOutputProps {
    command: string;
    cwd?: string;
    output: string;
    exitCode?: number;
    toolName?: string;
    onAllow?: () => void;
    onDecline?: () => void;
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({ 
    command, 
    cwd, 
    output, 
    exitCode,
    toolName,
    onAllow,
    onDecline
}) => {
    const [showAlwaysRunConfig, setShowAlwaysRunConfig] = useState(false);
    const [alwaysRunEnabled, setAlwaysRunEnabled] = useState(false);
    const [timeout, setTimeout_] = useState(60000);
    const needsApproval = typeof onAllow === 'function' || typeof onDecline === 'function';

    return (
        <div className="terminal-container" style={{
            backgroundColor: '#1e1e1e',
            color: '#cccccc',
            borderRadius: '6px',
            border: '1px solid #333',
            overflow: 'hidden',
            fontFamily: 'var(--vscode-editor-font-family, "Cascadia Code", Consolas, monospace)',
            fontSize: '13px',
            margin: '4px 0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
            {/* Header */}
            <div className="terminal-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 12px',
                backgroundColor: '#252526',
                borderBottom: '1px solid #333'
            }}>
                <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {toolName ? `Executing tool: ${toolName}` : 'Ran command'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Always Run config toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#bbb' }}
                        onClick={() => setShowAlwaysRunConfig(v => !v)}>
                        <span style={{ fontSize: '11px' }}>Always run</span>
                        <i className={`codicon ${showAlwaysRunConfig ? 'codicon-chevron-up' : 'codicon-chevron-down'}`} style={{ fontSize: '12px' }} />
                    </div>
                    {/* Relocate */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#bbb' }} onClick={() => {
                        vscodeService.postMessage({ command: 'relocateTerminal', payload: { command } });
                    }}>
                        <span style={{ fontSize: '11px' }}>Relocate</span>
                        <i className="codicon codicon-link-external" style={{ fontSize: '12px' }} />
                    </div>
                </div>
            </div>

            {/* Always-run config popup */}
            {showAlwaysRunConfig && (
                <div style={{
                    backgroundColor: '#2d2d2d',
                    borderBottom: '1px solid #444',
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '12px'
                }}>
                    <div style={{ color: '#ccc', fontWeight: 600, marginBottom: 2 }}>Always Run Settings</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#bbb' }}>
                        <input
                            type="checkbox"
                            checked={alwaysRunEnabled}
                            onChange={(e) => {
                                setAlwaysRunEnabled(e.target.checked);
                                vscodeService.postMessage({ command: 'setAlwaysRun', payload: { enabled: e.target.checked, timeout } });
                            }}
                            style={{ cursor: 'pointer' }}
                        />
                        Always run terminal commands without asking
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#bbb' }}>
                        <span>Timeout (ms):</span>
                        <input
                            type="number"
                            value={timeout}
                            onChange={(e) => setTimeout_(parseInt(e.target.value) || 60000)}
                            onBlur={() => vscodeService.postMessage({ command: 'setAlwaysRun', payload: { enabled: alwaysRunEnabled, timeout } })}
                            style={{
                                width: '90px',
                                background: '#3c3c3c',
                                border: '1px solid #555',
                                color: '#ccc',
                                borderRadius: 3,
                                padding: '2px 6px',
                                fontSize: '12px'
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Command Area */}
            <div className="terminal-command-line" style={{
                padding: '10px 12px',
                backgroundColor: '#1e1e1e',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                borderBottom: '1px dotted #333'
            }}>
                <span style={{ color: '#666', opacity: 0.8, whiteSpace: 'nowrap' }}>{cwd ? `${cwd} >` : '>'}</span>
                <code style={{ color: '#d4d4d4', flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{command}</code>
                <i className="codicon codicon-copy" style={{ fontSize: '14px', color: '#666', cursor: 'pointer' }} title="Copy command" onClick={() => {
                    navigator.clipboard.writeText(command);
                    vscodeService.postMessage({ command: 'showInformationMessage', text: 'Command copied to clipboard' });
                }} />
            </div>

            {/* Output Area */}
            {output ? (
                <div className="terminal-output-body" style={{
                    padding: '12px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.5',
                    color: '#d4d4d4'
                }}>
                    {output}
                </div>
            ) : (
                <div style={{ padding: '10px 12px', color: '#666', fontSize: '12px', fontStyle: 'italic' }}>
                    Waiting for output…
                </div>
            )}

            {/* Footer: Allow/Decline for pending approval, else exit code */}
            <div className="terminal-footer" style={{
                display: 'flex',
                justifyContent: needsApproval ? 'flex-end' : 'space-between',
                alignItems: 'center',
                padding: '6px 12px',
                backgroundColor: '#252526',
                borderTop: '1px solid #333',
                fontSize: '11px',
                gap: '8px'
            }}>
                {needsApproval ? (
                    <>
                        <span style={{ color: '#888', marginRight: 'auto' }}>Allow this command to run?</span>
                        <VSCodeButton
                            appearance="secondary"
                            onClick={onDecline}
                        >
                            Decline
                        </VSCodeButton>
                        <VSCodeButton
                            onClick={onAllow}
                        >
                            Allow
                        </VSCodeButton>
                    </>
                ) : (
                    exitCode !== undefined ? (
                        <div style={{ color: exitCode === 0 ? '#89d185' : '#f14c4c', marginLeft: 'auto' }}>
                            Exit {exitCode === 0 ? 'success' : `code ${exitCode}`}
                        </div>
                    ) : null
                )}
            </div>
        </div>
    );
};
