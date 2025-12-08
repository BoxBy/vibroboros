import React, { useState, useEffect, useRef } from 'react';
import { DisplayMessage } from './MainView';
import ReactMarkdown, { Components } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { vscodeService } from './services/vscode';

interface MessageItemProps {
    message: DisplayMessage;
    onAction?: () => void;
}

const CollapsibleCode: React.FC<{ language: string; children: React.ReactNode }> = ({ language, children }) => {
    const [isCollapsed, setIsCollapsed] = useState(true);

    return (
        <div className="collapsible-code" style={{ 
            border: '1px solid var(--vscode-widget-border)', 
            borderRadius: '6px',
            margin: '8px 0',
            overflow: 'hidden',
            minWidth: '300px'
        }}>
            <div 
                onClick={() => setIsCollapsed(!isCollapsed)}
                style={{
                    padding: '6px 12px',
                    background: 'var(--vscode-editor-inactiveSelectionBackground)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    userSelect: 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={`codicon ${isCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'}`} />
                    <span style={{ fontWeight: 600 }}>{language || 'code'}</span>
                </div>
                <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
                    {isCollapsed ? 'Click to expand' : 'Click to collapse'}
                </span>
            </div>
            {!isCollapsed && (
                <div style={{ padding: 0 }}>
                    <SyntaxHighlighter
                        children={String(children).replace(/\n$/, '')}
                        style={vscDarkPlus as any}
                        language={language}
                        PreTag="div"
                        customStyle={{ margin: 0, borderRadius: 0 }}
                    />
                </div>
            )}
        </div>
    );
};

const markdownComponents: Components = {
    code({ node, className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '');
        const inline = !match;

        return !inline && match ? (
            <CollapsibleCode language={match[1]}>
                {children}
            </CollapsibleCode>
        ) : (
            <code className={className} {...props}>
                {children}
            </code>
        );
    },
    a({ href, children, ...props }) {
        const isFile = typeof href === 'string' && /^file:\/\//i.test(href);
        if (isFile) {
            return (
                <a
                    href={href}
                    onClick={(e) => { e.preventDefault(); try { vscodeService.postMessage({ command: 'openAttachment', payload: { uri: href } }); } catch {} }}
                    {...props}
                >
                    {children}
                </a>
            );
        }
        return (
            <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
                {children}
            </a>
        );
    }
};

const formatTimestamp = (isoString: string | undefined): string => {
    if (!isoString) return '';
    try {
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
};


const ProgressLogItem: React.FC<{ message: any }> = ({ message }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    
    return (
        <div className="progress-log-item" 
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
            padding: '0 0 0 8px',
            margin: isCollapsed ? '0 0 2px 0' : '0', // Connect lines when expanded
            fontSize: '0.9em', // 이미지 기준 폰트 크기
            color: 'var(--vscode-descriptionForeground)',
            fontFamily: 'var(--vscode-font-family)',
            borderLeft: isCollapsed ? 'none' : '2px solid var(--vscode-textBlockQuote-border)',
            lineHeight: '1.2em',
            position: 'relative',
            cursor: 'pointer'
        }}>
            <span style={{
                position: 'absolute',
                left: isCollapsed ? '0px' : '-1px',
                color: 'var(--vscode-editorGuide-activeBackground)',
                fontWeight: isCollapsed ? 'bold' : 'normal'
            }}>{isCollapsed ? '>' : ''}</span>
            <span style={{ paddingLeft: isCollapsed ? '12px' : '4px', display: 'block', whiteSpace: isCollapsed ? 'nowrap' : 'pre-wrap', overflow: isCollapsed ? 'hidden' : 'visible', textOverflow: isCollapsed ? 'ellipsis' : 'clip' }}>
                {message.text.replace(/^>\s*/gm, '').replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}\u{2B06}\u{2B07}\u{2B05}\u{27A1}\u{2194}-\u{21AA}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FC}\u{25FB}\u{25FA}\u{221A}\u{2714}\u{2705}\u{274C}\u{274E}\u{2716}\u{2795}\u{2796}\u{2797}\u{27B0}\u{27BF}\u{1F191}-\u{1F19A}]/gu, '')}
            </span>
        </div>
    );
};

export const MessageItem: React.FC<MessageItemProps> = ({ message, onAction }) => {
    const handleFileNameClick = () => {
        if ((message as any).filePath) {
            vscodeService.postMessage({ command: 'openFile', filePath: (message as any).filePath });
        }
    };

    // Progress log rendering with collapse support
    if ((message as any).kind === 'progress') {
        return <ProgressLogItem message={message} />;
    }

    // codeEditFile: 파일 생성/수정 카드 (SDK 표준 UI 구조)
    if ((message as any).kind === 'codeEditFile') {
        const baseName = (message.filePath || '').split(/[\\\/]/).pop() || message.title || 'File';
        const relativePath = (message as any).relativePath || (message.filePath || '');
        // Determine status text and badge
        const isEdit = (message as any).suggestionType === 'edit-file' || (message as any).description === 'File updated';
        const badgeText = isEdit ? 'Modified' : 'Created';
        
        // If lintSummary is present, use it. Otherwise, use badgeText as status if we want to show it on left too, or just empty.
        // Actually, user wants to remove duplication.
        // Let's show Lint info on the left (if available), and Created/Modified badge on the right.
        // If no lint info is available (e.g. just created without lint check), we can show "Checked" or nothing on left?
        // The issue was "Created" on left AND "Modified" on right.
        
        // New logic:
        // Left side: Lint status (if available) OR "Success"
        // Right side: Created/Modified badge
        
        const lintSummary = message.lintSummary;
        const hasLintErrors = lintSummary && !lintSummary.includes('0 lint');
        const leftStatusText = lintSummary || 'Ready'; // Default to Ready or similar if no lint info
        
        return (
            <div className="message-group" style={{ marginBottom: 16, width: '100%' }}>
                <div className="message model-message" style={{
                    padding: 0,
                    overflow: 'hidden',
                    background: 'transparent',
                    boxShadow: 'none',
                    margin: '8px 0',
                    maxWidth: 'none',
                    width: '100%',
                    alignSelf: 'stretch'
                }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '10px 12px',
                        background: 'var(--vscode-editor-background)',
                        border: '1px solid var(--vscode-widget-border)',
                        borderRadius: 6,
                        position: 'relative'
                    }}>
                        {/* 첫 번째 줄: 파일 이름 (좌) + 상대 경로 (우) */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                <span className="codicon codicon-file-code" style={{ fontSize: 16, color: 'var(--vscode-textLink-foreground)', flexShrink: 0 }} />
                                <span
                                    onClick={handleFileNameClick}
                                    style={{
                                        fontWeight: 600,
                                        fontSize: '13px',
                                        color: 'var(--vscode-textLink-foreground)',
                                        cursor: 'pointer',
                                        textDecoration: 'none',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                    title="Click to view diff"
                                >
                                    {baseName}
                                </span>
                            </div>
                            <span style={{
                                fontSize: '11px',
                                color: 'var(--vscode-descriptionForeground)',
                                marginLeft: 8,
                                flexShrink: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '50%'
                            }}>
                                {relativePath}
                            </span>
                        </div>

                        {/* 두 번째 줄: lint errors (좌) + Created/Modified 태그 (우) */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {hasLintErrors ? (
                                    <>
                                        <span className="codicon codicon-warning" style={{ fontSize: 14, color: 'var(--vscode-errorForeground)' }} />
                                        <span style={{ fontSize: '11px', color: 'var(--vscode-errorForeground)' }}>
                                            {leftStatusText}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className="codicon codicon-check" style={{ fontSize: 14, color: 'var(--vscode-testing-iconPassed)' }} />
                                        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
                                            {leftStatusText}
                                        </span>
                                    </>
                                )}
                            </div>
                            <span style={{
                                fontSize: '11px',
                                color: 'var(--vscode-descriptionForeground)',
                                padding: '2px 6px',
                                borderRadius: 3,
                                background: 'var(--vscode-button-secondaryBackground)',
                                border: '1px solid var(--vscode-button-secondaryBorder)',
                                flexShrink: 0
                            }}>
                                {badgeText}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

	const [showThought, setShowThought] = useState(false);
	const isModel = message.sender === 'ai';
    const isOrchestrator = (!message.senderName || (message.senderName || '').trim() === 'OrchestratorAgent');
    // 모든 Agent bubble은 항상 펼쳐진 상태로 표시
    const [showAgentBubble, setShowAgentBubble] = useState<boolean>(true);
    const [chipsOpen, setChipsOpen] = useState(false);
    const [renderedDiffHtml, setRenderedDiffHtml] = useState<string | null>(null);
    const prevDiffRef = useRef(message.diff);

    useEffect(() => {
        if (message.diff && message.diff.diffHtml) {
            setRenderedDiffHtml(message.diff.diffHtml);
        } else {
            setRenderedDiffHtml(null);
        }

        // Auto-collapse if diff was present but is now gone (action taken)
        if (prevDiffRef.current && !message.diff) {
            setShowAgentBubble(false);
        }
        prevDiffRef.current = message.diff;
    }, [message.diff]);

    useEffect(() => {
        if (isModel && !isOrchestrator) {
            if ((message as any).requiresUserInput && !showAgentBubble) {
                setShowAgentBubble(true);
            }
        }
    }, [message]);

	return (
		<div className={`message-item ${isModel ? 'ai' : 'user'}`}>
            <style>{`
                .sender-info {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: #888;
                    margin-bottom: 4px;
                }
                .model-message .sender-info {
                    margin-left: 5px;
                }
                .user-message .sender-info {
                    margin-right: 5px;
                    flex-direction: row-reverse;
                }
                .sender-label {
                    font-weight: bold;
                }
                .thought-toggle {
                    cursor: pointer;
                    margin: 6px 0;
                    font-size: 12px;
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 4px 8px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    width: fit-content;
                    color: var(--vscode-descriptionForeground);
                    user-select: none;
                }
                .thought-toggle:hover {
                    background: var(--vscode-toolbar-hoverBackground);
                }
                .thought-toggle .codicon {
                    font-size: 14px;
                    margin-right: 6px;
                }
                .thought-process {
                    margin-top: 4px;
                    margin-bottom: 8px;
                    padding: 8px;
                    border-left: 2px solid var(--vscode-textLink-foreground);
                    background: var(--vscode-editor-lineHighlightBackground);
                    border-radius: 0 4px 4px 0;
                    font-size: 0.9em;
                    color: var(--vscode-editorCodeLens-foreground);
                }
                .agent-toggle {
                    cursor: pointer;
                    margin: 2px 0 4px 0;
                    font-size: 14px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    color: var(--vscode-descriptionForeground);
                }
                .agent-toggle .codicon {
                    font-size: 16px;
                }
            `}</style>
            {isModel && (
                <div
                    className={`agent-toggle ${showAgentBubble ? 'open' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={showAgentBubble ? 'true' : 'false'}
                    onClick={() => setShowAgentBubble(v => !v)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowAgentBubble(v => !v); } }}
                    title={showAgentBubble ? 'Hide agent output' : 'Show agent output'}
                >
                    <span className={`codicon ${showAgentBubble ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
                    <span style={{color: 'var(--vscode-descriptionForeground)'}}>
                        {(() => {
                            const name = message.senderName || '';
                            if (!name || name.trim() === '' || name === 'OrchestratorAgent') {
                                return '[Orchestrator]';
                            }
                            const displayName = name.replace(/Agent$/i, '');
                            return displayName ? `[${displayName}]` : '[Agent]';
                        })()}
                    </span>
                </div>
            )}
            {isModel && message.thought && (
                <div
                    className={`thought-toggle ${showThought ? 'open' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={showThought ? 'true' : 'false'}
                    onClick={() => setShowThought(!showThought)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowThought(v => !v); } }}
                    title={showThought ? 'Hide process' : 'Show process'}
                    style={{ marginLeft: 0, display: 'flex' }}
                >
                    <span className={`codicon ${showThought ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
                    <span>Thinking Process</span>
                </div>
            )}
            {isModel && message.thought && showThought && (
                <pre className={`thought-process open`} aria-hidden="false">
                    <code>{message.thought}</code>
                </pre>
            )}
            {!isModel && Array.isArray(message.attachments) && message.attachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', margin: '2px 0 4px 0' }}>
                    <button
                        onClick={() => setChipsOpen(v => !v)}
                        className="chip-toggle"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            color: 'var(--vscode-foreground)',
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            fontSize: 12
                        }}
                        title="Attachments"
                    >
                        <span className={`codicon ${chipsOpen ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
                        <span>Attachments ({message.attachments.length})</span>
                    </button>
                    {chipsOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 8, maxWidth: '70%' }}>
                            {message.attachments.map((a, idx) => {
                                const isImage = (a as any).type === 'file' && (a as any).content && typeof (a as any).content === 'string' && ((a as any).content.startsWith('data:image/') || (a.label || '').match(/\.(jpg|jpeg|png|gif|webp|svg)$/i));
                                return (
                                    <div key={(a.uri || a.label || '') + ':' + idx} style={{ marginBottom: 4 }}>
                                        {isImage && (a as any).content ? (
                                            <div style={{ marginTop: 4 }}>
                                                <img
                                                    src={(a as any).content}
                                                    alt={(a as any).label || 'Image'}
                                                    style={{
                                                        maxWidth: '100%',
                                                        maxHeight: '300px',
                                                        borderRadius: 6,
                                                        border: '1px solid var(--vscode-editorWidget-border)',
                                                        cursor: 'pointer'
                                                    }}
                                                    onClick={() => {
                                                        try {
                                                            if ((a as any).uri) {
                                                                vscodeService.postMessage({ command: 'openAttachment', payload: { uri: (a as any).uri } });
                                                            }
                                                        } catch {}
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <span
                                                title={a.uri || a.label}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                                    background: 'var(--vscode-badge-background)',
                                                    color: 'var(--vscode-badge-foreground)',
                                                    border: '1px solid var(--vscode-editorWidget-border)',
                                                    borderRadius: 8,
                                                    padding: '2px 0', paddingLeft: 4, paddingRight: 3, fontSize: 12,
                                                    cursor: (a as any).uri ? 'pointer' : 'default'
                                                }}
                                                onClick={() => {
                                                    try {
                                                        if ((a as any).uri) {
                                                            vscodeService.postMessage({ command: 'openAttachment', payload: { uri: (a as any).uri } });
                                                        }
                                                    } catch {}
                                                }}
                                            >
                                                <span style={{
                                                    fontSize: 10,
                                                    textTransform: 'uppercase',
                                                    color: 'var(--vscode-descriptionForeground)',
                                                    background: 'var(--vscode-editor-inactiveSelectionBackground)',
                                                    border: '1px solid var(--vscode-editorWidget-border)',
                                                    borderRadius: 6,
                                                    padding: '0 6px'
                                                }}>{(a as any).type}</span>
                                                <span style={{ lineHeight: '16px', transform: 'translateY(-1px)' }}>{(a as any).label}</span>
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            {(showAgentBubble || !isModel) && (
            <div className={`message ${isModel ? 'model-message' : 'user-message'}`}>
                <div className="sender-info">
                    {/* Agent 이름 제거 - bubble 외부에만 표시 */}
                    <span className="timestamp">{formatTimestamp(message.timestamp)}</span>
                </div>
                <div className="message-content">
                    <ReactMarkdown
                        children={message.text}
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                    />
                    {isModel && Array.isArray(message.attachments) && message.attachments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', margin: '4px 0 2px 0' }}>
                            <button
                                onClick={() => setChipsOpen(v => !v)}
                                className="chip-toggle"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    color: 'var(--vscode-foreground)',
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    fontSize: 12
                                }}
                                title="Referenced files"
                            >
                                <span className={`codicon ${chipsOpen ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
                                <span>Referenced ({message.attachments.length})</span>
                            </button>
                            {chipsOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginLeft: 8, maxWidth: '70%' }}>
                                    {message.attachments.map((a, idx) => (
                                        <span
                                            key={(a.uri || a.label || '') + ':' + idx}
                                            title={a.uri || a.label}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                background: 'var(--vscode-badge-background)',
                                                color: 'var(--vscode-badge-foreground)',
                                                border: '1px solid var(--vscode-editorWidget-border)',
                                                borderRadius: 8,
                                                padding: '2px 0', paddingLeft: 4, paddingRight: 3, fontSize: 12,
                                                cursor: (a as any).uri ? 'pointer' : 'default'
                                            }}
                                            onClick={() => {
                                                try {
                                                    if ((a as any).uri) {
                                                        vscodeService.postMessage({ command: 'openAttachment', payload: { uri: (a as any).uri } });
                                                    }
                                                } catch {}
                                            }}
                                        >
                                            <span style={{
                                                fontSize: 10,
                                                textTransform: 'uppercase',
                                                color: 'var(--vscode-descriptionForeground)',
                                                background: 'var(--vscode-editor-inactiveSelectionBackground)',
                                                border: '1px solid var(--vscode-editorWidget-border)',
                                                borderRadius: 6,
                                                padding: '0 6px'
                                            }}>{(a as any).type}</span>
                                            <span style={{ lineHeight: '16px', transform: 'translateY(-1px)' }}>{(a as any).label}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {message.uroborosProposal && (() => {
                        const proposal = message.uroborosProposal;
                        return (
                            <div style={{ marginTop: '12px', padding: '12px', background: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: '6px', border: '1px solid var(--vscode-editorWidget-border)' }}>
                                <div className="action-buttons" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                        style={{ padding: '8px 16px', background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}
                                        onClick={() => {
                                            vscodeService.postMessage({
                                                command: 'acceptUroborosMode',
                                                payload: { userText: proposal.userText }
                                            });
                                            if (onAction) onAction();
                                        }}
                                    >
                                        <span className="codicon codicon-check" />
                                        Approve
                                    </button>
                                    <button
                                        style={{ padding: '8px 16px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}
                                        onClick={() => {
                                            vscodeService.postMessage({
                                                command: 'declineUroborosMode',
                                                payload: { userText: proposal.userText, suppressForSession: false }
                                            });
                                            if (onAction) onAction();
                                        }}
                                    >
                                        <span className="codicon codicon-close" />
                                        Decline
                                    </button>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                vscodeService.postMessage({
                                                    command: 'declineUroborosMode',
                                                    payload: { userText: proposal.userText, suppressForSession: true }
                                                });
                                            }
                                        }}
                                    />
                                    Don't ask again in this session
                                </label>
                            </div>
                        );
                    })()}
                    {message.buttons && message.buttons.length > 0 && (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {message.buttons.map((btn, idx) => {
                                const isSecondary = btn.style === 'secondary';
                                const isDanger = btn.style === 'danger';
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            vscodeService.postMessage({
                                                command: btn.command,
                                                payload: btn.payload
                                            });
                                            if (onAction) onAction();
                                        }}
                                        style={{
                                            padding: '8px 16px',
                                            background: isDanger ? 'var(--vscode-errorForeground)' : (isSecondary ? 'var(--vscode-button-secondaryBackground)' : 'var(--vscode-button-background)'),
                                            color: isDanger ? 'var(--vscode-button-foreground)' : (isSecondary ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-button-foreground)'),
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontWeight: 500,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        {btn.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {message.diff && (
                        <div>
                            {renderedDiffHtml ? (
                                <div dangerouslySetInnerHTML={{ __html: renderedDiffHtml }} />
                            ) : (
                                <div style={{ fontSize: '0.95em', color: 'var(--vscode-descriptionForeground)', marginBottom: 6 }}>
                                    <a href="#" onClick={(e) => { e.preventDefault(); vscodeService.postMessage({ command: 'focusDiffSummary' }); }}>
                                        View diff in summary
                                    </a>
                                </div>
                            )}
                            <div className="action-buttons">
                                <button className="action-btn edit-btn" onClick={() => { if (!message.diff) return; vscodeService.postMessage({
                                    command: 'showDiff',
                                    originalCode: message.diff.originalCode,
                                    modifiedCode: message.diff.modifiedCode,
                                    title: message.diff.title || message.diff.filePath,
                                }); }}>Edit</button>
                                <button className="action-btn accept-btn" onClick={() => { if (!message.diff) return; vscodeService.postMessage({
                                    command: 'acceptChange',
                                    filePath: message.diff.filePath,
                                    originalCode: message.diff.originalCode,
                                    modifiedCode: message.diff.modifiedCode,
                                    suggestionType: message.diff.suggestionType,
                                }); }}>Approve</button>
                                <button className="action-btn decline-btn" onClick={() => { if (!message.diff) return; vscodeService.postMessage({
                                    command: 'declineChange',
                                    filePath: message.diff.filePath,
                                }); }}>Decline</button>
                                <button className="action-btn accept-always-btn" onClick={() => { if (!message.diff) return; vscodeService.postMessage({
                                    command: 'acceptAlways',
                                    filePath: message.diff.filePath,
                                    originalCode: message.diff.originalCode,
                                    modifiedCode: message.diff.modifiedCode,
                                    suggestionType: message.diff.suggestionType,
                                }); }}>Accept Always</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            )}

        </div>
	);
};
