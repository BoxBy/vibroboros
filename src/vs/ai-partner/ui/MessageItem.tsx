import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DisplayMessage } from './MainView';
import ReactMarkdown, { Components } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { vscodeService } from './services/vscode';
import { diffLines } from 'diff';
import { TerminalOutput } from './components/TerminalOutput';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

interface MessageItemProps {
    message: DisplayMessage;
    onAction?: () => void;
    onRollback?: (messageId: string | undefined, timestamp: string) => void;
    isLast?: boolean;
    isThinking?: boolean;
    hasSubsequentUserMessage?: boolean;
}





const formatTimestamp = (isoString: string | undefined): string => {
    if (!isoString) return '';
    try {
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
};



// Common markdown components
const markdownComponents: Components = {
    code({node, className, children, ...props}: any) {
        const match = /language-(\w+)/.exec(className || '')
        return !className?.includes('language-carousel') ? (
        match ? (
            <SyntaxHighlighter
                children={String(children).replace(/\n$/, '')}
                style={vscDarkPlus as any}
                language={match[1]}
                PreTag="div"
                customStyle={{ margin: 0, borderRadius: 0 }}
                {...props}
            />
        ) : (
            <code className={className} {...props}>
                {children}
            </code>
        )
        ) : (
            <div className="carousel-placeholder">[Carousel]</div> 
            // Carousel not fully implemented in this view or needs recursive import handling
        )
    }
};

interface ProgressLogItemProps {
    message: DisplayMessage;
    isLast: boolean;
    depth?: number;
}

const ProgressLogItem: React.FC<ProgressLogItemProps> = ({ message, isLast, depth = 0 }) => {
    // [UI Fix] Requirement 5: Auto-collapse if not the latest log
    // Only set default state on mount. If user expands/collapses, respect that.
    const [isCollapsed, setIsCollapsed] = useState(!isLast);
    
    useEffect(() => {
        if (!isLast) {
            setIsCollapsed(true);
        }
    }, [isLast]);

    // [UI Fix] Requirement 1 & 2 & 4: Routing parsing & Visual Separation
    // Parse text to see if it contains "Routing to ..."
    const { preRouting, routingLine, postRouting } = useMemo(() => {
        const text = message.text || '';
        const routingRegex = /^(Routing to .*?)(?:\.\.\.|…)?$/m;
        const match = text.match(routingRegex);

        if (match && match.index !== undefined) {
             const routingLine = match[1] + '...'; // Ensure ellipsis
             const pre = text.slice(0, match.index).trim();
             const post = text.slice(match.index + match[0].length).trim();
             return { preRouting: pre, routingLine, postRouting: post };
        }
        return { preRouting: text, routingLine: null, postRouting: null };
    }, [message.text]);

    // Clean text for collapsed preview
    const collapsedPreview = useMemo(() => {
        if (routingLine) return routingLine; 
        
        // Simplify dynamic thinking headers (e.g. "[OrchestratorAgent] Thinking... Thinking Process...")
        const text = message.text || '';
        const orchThinkRegex = /^(?:>\s*)?\[(OrchestratorAgent|Orchestrator|Agent)\](?:\s*Thinking\.\.\.|\s*Thinking Process).*$/i;
        const orchMatch = text.match(orchThinkRegex);
        if (orchMatch) return `[${orchMatch[1]}] Thinking...`;

        // Req 3: Show "Thinking..." header if present
        const headerMatch = text.match(/^\[.*?\] Thinking\.\.\./);
        if (headerMatch) return headerMatch[0];

        // Fallback: first line or stripped
        const clean = text
             .replace(/<\/?thinking>/g, '')
             .replace(/^>\s*/gm, ''); 
        return clean.split('\n')[0].substring(0, 100) + (clean.length > 100 ? '...' : '');
    }, [message.text, routingLine]);

    const formatBlock = (content: string) => {
        return content
            .split('\n').map(line => line.trimEnd() + '  ').join('\n') // Force hard line breaks
            .replace(/<thinking>/g, '\n> ')
            .replace(/<\/thinking>/g, '\n')
            // Simplify headers - target ONLY the header and its metadata part, preserving subsequent content
            .replace(/^\s*\[(OrchestratorAgent|Orchestrator|Agent)\]\s*(?:Thinking\.\.\.|\s*Thinking Process)(?:\s*Thinking Process\s*\([^)]*\))?/gim, '[$1] Thinking...');
    };

    const formatLogContent = (content: string) => {
        // MCP Executing Tool
        if (content.includes('[MCP]') && content.includes('Executing Tool:')) {
            const match = content.match(/\[MCP\] Executing Tool: (.*?)(?: with args: (.*))?$/);
            if (match) {
                const tool = match[1];
                return (
                    <div>[MCP] Executing Tool: {tool}</div>
                );
            }
        }

        // MCP Error Handling
        if (content.includes('failed: MCP error')) {
            const match = content.match(/(.*failed: MCP error)(.*)/s);
            if (match) {
                const header = match[1].trim();
                const detail = match[2].trim();
                return (
                    <details style={{ cursor: 'pointer' }}>
                        <summary style={{ listStyle: 'none', fontWeight: 500, color: 'var(--vscode-errorForeground, #f14c4c)' }}>
                            {header}
                        </summary>
                        <div style={{ paddingLeft: '12px', marginTop: '4px', opacity: 0.8, fontSize: '12px', whiteSpace: 'pre-wrap', borderLeft: '2px solid var(--vscode-errorForeground)' }}>
                            {detail}
                        </div>
                    </details>
                );
            }
        }
        return <ReactMarkdown 
            children={formatBlock(content)}
            remarkPlugins={[remarkGfm]}
            components={{
                ...markdownComponents,
                p: ({node, ...props}) => <p style={{margin: '0 0 4px 0'}} {...props} />,
                ul: ({node, ...props}) => <ul style={{paddingLeft: '28px', margin: '6px 0'}} {...props} />,
                ol: ({node, ...props}) => <ol style={{paddingLeft: '28px', margin: '6px 0'}} {...props} />,
                li: ({node, ...props}) => <li style={{marginBottom: '4px'}} {...props} />
            }}
        />;
    };

    return (
        <div className="progress-log-container">
            {/* Main/Parent Block */}
            <div className="progress-log-item" 
                onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('a, pre, code, button, .collapsible-code, img')) return;
                    setIsCollapsed(!isCollapsed);
                }}
                style={{
                    padding: '2px 0 2px 8px',
                    margin: depth > 0 ? `4px 0 4px ${depth * 7}px` : '0', // Halved indentation
                    fontSize: '14px', 
                    color: 'var(--vscode-descriptionForeground)',
                    fontFamily: 'var(--vscode-font-family)',
                    borderLeft: 'none', 
                    lineHeight: '1.4em',
                    position: 'relative',
                    cursor: 'pointer',
                    opacity: 0.95
                }}>
                <span style={{
                    position: 'absolute',
                    left: isCollapsed ? '0px' : '-1px',
                    top: '4px',
                    color: 'var(--vscode-editorGuide-activeBackground)',
                    fontWeight: 'normal'
                }}>
                    <i className={`codicon codicon-chevron-${isCollapsed ? 'right' : 'down'}`} style={{ fontSize: '14px' }} />
                </span>

                <div className="progress-log-text" style={{ 
                    paddingLeft: '16px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: isCollapsed ? 'nowrap' : 'normal'
                }}>
                    {isCollapsed ? collapsedPreview : (
                        <div className="progress-log-expanded">
                            {formatLogContent(preRouting)}
                            
                            {routingLine && (
                                <div style={{
                                    margin: '8px 0', 
                                    fontStyle: 'italic', 
                                    color: 'var(--vscode-textLink-foreground)'
                                }}>
                                    {routingLine}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Part 3: Nested/Indented Block (Worker Agent) */}
            {!isCollapsed && postRouting && (
                <div className="progress-log-nested" style={{
                    marginLeft: `${(depth + 1) * 7}px`, // Halved indentation
                    paddingLeft: '8px',
                    borderLeft: 'none', 
                    marginTop: '4px',
                    fontSize: '14px',
                    color: 'var(--vscode-descriptionForeground)'
                }}>
                     {formatLogContent(postRouting)}
                </div>
            )}
        </div>
    );
};



const ProgressGroupItem: React.FC<{ group: any; hasSubsequentUserMessage?: boolean }> = ({ group, hasSubsequentUserMessage }) => {
    // Initial state: fold if there is a subsequent user message
    const [isCollapsed, setIsCollapsed] = useState(!!hasSubsequentUserMessage);
    const [userInteracted, setUserInteracted] = useState(false);

    // Auto-folding logic: collapse when a user message appears after this group
    useEffect(() => {
        if (!userInteracted && hasSubsequentUserMessage) {
            setIsCollapsed(true);
        }
    }, [hasSubsequentUserMessage, userInteracted]);

    const allLogs = group.messages || [];

    // Filter noise from progress log:
    // 1. Remove pure "[XXX] Thinking..." entries that have a subsequent non-thinking log
    //    (works for both completed and streaming: if even one content log exists after, hide all prior pure thinking headers)
    // 2. Remove "[System] ..." retry/error messages
    const SYSTEM_NOISE_RE = /^\[System\]/i;
    const logs = allLogs.filter((log: any) => {
        const text = (log.text || '').trim();
        if (SYSTEM_NOISE_RE.test(text)) return false;
        
        // Restore thinking logs if they look like header markers (e.g. [OrchestratorAgent])
        // Hide only the purely mechanical "Thinking..." lines OR headers with NO content
        const orchHeaderPattern = /^(?:>\s*)?\[(OrchestratorAgent|Orchestrator|Agent)\](?:\s*Thinking\.\.\.|\s*Thinking Process).*$/i;
        const mechanicalThinkingRE = /^Thinking\.\.\.?\s*$/i;

        if (mechanicalThinkingRE.test(text)) return false;
        
        // If it's a header line AND it's the ONLY content of this log, hide it
        if (orchHeaderPattern.test(text)) {
            const contentAfterHeader = text.replace(orchHeaderPattern, '').trim();
            if (!contentAfterHeader) return false;
        }
        
        return true;
    });
    const lastLog = logs[logs.length - 1];
    const logCount = logs.length;

    // Clean text for summary preview
    const stripEmojis = (text: string) => text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}\u{2B06}\u{2B07}\u{2B05}\u{27A1}\u{2194}-\u{21AA}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FC}\u{25FB}\u{25FA}\u{221A}\u{2714}\u{2705}\u{274C}\u{274E}\u{2716}\u{2795}\u{2796}\u{2797}\u{27B0}\u{27BF}\u{1F191}-\u{1F19A}]/gu, '');
    const cleanSummary = lastLog ? stripEmojis(lastLog.text.replace(/^>\s*/gm, '')) : '';

    return (
        <div className="progress-group" style={{ marginBottom: 4 }}>
            <div 
                className="progress-group-header"
                onClick={() => {
                    setIsCollapsed(!isCollapsed);
                    setUserInteracted(true);
                }}
                style={{ 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    padding: '2px 0',
                    fontSize: '14px',
                    marginBottom: '4px'
                }}
            >
                <span className={`codicon ${isCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'}`} style={{ fontSize: '14px', flexShrink: 0 }} />
                <span style={{ fontWeight: 'normal', whiteSpace: 'nowrap', flexShrink: 0 }}>{logCount} steps</span>
                {isCollapsed && (
                    <span style={{ 
                        opacity: 0.7, 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        marginLeft: '4px'
                    }}>
                        {cleanSummary}
                    </span>
                )}
            </div>
            
            {!isCollapsed && (
                <div className="progress-group-content" style={{ marginTop: '2px' }}>
                    {(() => {
                        // Stack-based indentation logic
                        const depths: number[] = [];
                        const rootAgent = logs[0]?.senderName || 'OrchestratorAgent';
                        const stack: string[] = [rootAgent];

                        logs.forEach((log: any) => {
                            const text = log.text || '';
                            const agentMatch = text.match(/^\[(.*?)\]/);
                            if (agentMatch) {
                                const speaker = agentMatch[1].trim();
                                const stackIdx = stack.indexOf(speaker);
                                if (stackIdx !== -1) stack.splice(stackIdx + 1);
                            }
                            depths.push(Math.max(0, stack.length - 1));
                            const routingMatch = text.match(/Routing to (.*?)(?:\.\.\.|…|$)/i);
                            if (routingMatch) stack.push(routingMatch[1].trim());
                        });

                        return logs.map((log: any, idx: number) => (
                            <ProgressLogItem 
                                key={idx} 
                                message={log} 
                                isLast={idx === logs.length - 1} 
                                depth={depths[idx]} 
                            />
                        ));
                    })()}
                    {/* Terminal messages nested inside group — hide when collapsed */}
                    {(group.terminalMessages || []).map((tm: any, idx: number) => {
                        const payload = tm.payload || {};
                        return (
                            <div key={`terminal-${idx}`} style={{ marginTop: 6 }}>
                                <TerminalOutput
                                    command={payload.command || tm.text}
                                    cwd={payload.cwd}
                                    output={payload.output}
                                    exitCode={payload.exitCode}
                                    toolName={payload.toolName || tm.senderName}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const AgentGroupItem: React.FC<{ group: any; hasSubsequentUserMessage?: boolean; onAction?: () => void; onRollback?: (messageId: string | undefined, timestamp: string) => void; isLast?: boolean; isThinking?: boolean }> = ({ group, hasSubsequentUserMessage, onAction, onRollback, isLast, isThinking }) => {
    const [isCollapsed, setIsCollapsed] = useState(!!hasSubsequentUserMessage);
    const [userInteracted, setUserInteracted] = useState(false);

    useEffect(() => {
        if (!userInteracted && hasSubsequentUserMessage) {
            setIsCollapsed(true);
        }
    }, [hasSubsequentUserMessage, userInteracted]);

    const messages = group.messages || [];
    const agentName = messages[0]?.senderName || 'Agent';

    return (
        <div className="agent-group" style={{ marginBottom: 4 }}>
            <div 
                className="agent-group-header"
                onClick={() => {
                    setIsCollapsed(!isCollapsed);
                    setUserInteracted(true);
                }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                    fontSize: '14px',
                    color: 'var(--vscode-descriptionForeground)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: 'rgba(0, 0, 0, 0.03)',
                    border: '1px solid var(--vscode-widget-border)',
                    borderRadius: '6px',
                    marginBottom: isCollapsed ? 0 : '4px'
                }}
            >
                <span className={`codicon ${isCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'}`} style={{ fontSize: '14px' }} />
                <span className="codicon codicon-robot" style={{ fontSize: '14px' }} />
                <span>{agentName} Discussing ({messages.length} messages)</span>
            </div>
            
            {!isCollapsed && (
                <div className="agent-group-content" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0,
                    paddingLeft: 12,
                    borderLeft: '2px solid var(--vscode-widget-border)',
                    marginLeft: 6
                }}>
                    {messages.map((msg: any, idx: number) => (
                        <MessageItem 
                            key={idx} 
                            message={msg} 
                            onAction={onAction} 
                            onRollback={onRollback} 
                            isLast={isLast && idx === messages.length - 1}
                            isThinking={isThinking}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const MessageItem: React.FC<MessageItemProps> = ({ message, onAction, onRollback, isLast, isThinking, hasSubsequentUserMessage }) => {
    // Hooks moved to top
	const [showThought, setShowThought] = useState(false);
	const isModel = message.sender === 'ai';
    const isOrchestrator = (!message.senderName || (message.senderName || '').trim() === 'OrchestratorAgent');
    const [showAgentBubble, setShowAgentBubble] = useState<boolean>(true);
    const [chipsOpen, setChipsOpen] = useState(false);
    const prevDiffRef = useRef(message.diff);

    useEffect(() => {
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

    const handleFileNameClick = () => {
        if ((message as any).filePath) {
            vscodeService.postMessage({ command: 'openFile', filePath: (message as any).filePath });
        }
    };

    // Unified handling for logs and group logs
    if ((message as any).kind === 'progressGroup') {
        return <ProgressGroupItem group={message} hasSubsequentUserMessage={hasSubsequentUserMessage} />;
    }
    if ((message as any).kind === 'agentGroup') {
        return <AgentGroupItem group={message} hasSubsequentUserMessage={hasSubsequentUserMessage} onAction={onAction} onRollback={onRollback} isLast={isLast} isThinking={isThinking} />;
    }
    if ((message as any).kind === 'progress') {
        return <ProgressLogItem message={message} isLast={!!isLast} />;
    }

    if ((message as any).kind === 'terminal') {
        const payload = (message as any).payload || {};
        return (
            <div className="message-group" style={{ marginBottom: 4, width: '100%' }}>
                <TerminalOutput 
                    command={payload.command || message.text}
                    cwd={payload.cwd}
                    output={payload.output}
                    exitCode={payload.exitCode}
                    toolName={payload.toolName || (message.senderName === 'Terminal' ? 'terminal_run' : message.senderName)}
                />
            </div>
        );
    }

    // Task UI rendering (Natural Flow for TaskDecompositionAgent)
    if ((message as any).kind === 'task') {
        const tasks: string[] = (message as any).tasks || [];
        const isNaturalFlow = message.senderName === 'TaskDecompositionAgent' || message.senderName === 'TaskDecomposition';
        
        // Fallback: parse text if tasks array is missing but kind is task
        const parsedTasks = tasks.length > 0 ? tasks : ((message as any).content?.[0]?.text || '').split('\n').filter((l: string) => /^\s*(?:-|\d+\.|\[ \]|\[x\]|\[\/\])\s+/.test(l));

        if (isNaturalFlow) {
            const total = parsedTasks.length;
            // Detect completion: [x] marker OR ✅ emoji present but ❌ absent
            const completed = parsedTasks.filter((t: string) => /\[x\]/i.test(t) || (t.includes('✅') && !t.includes('❌'))).length;
            const percent = total > 0 ? (completed / total) * 100 : 0;

            return (
                <div className="message-group" style={{ marginBottom: 12, width: '100%' }}>
                    <div className="message model-message" style={{ padding: '10px 14px', background: 'var(--vscode-editor-background)', border: '1px solid var(--vscode-widget-border)', borderRadius: 12, borderBottomLeftRadius: 2 }}>
                        <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Progress</span>
                            <span>{completed}/{total}</span>
                        </div>
                        <div className="task-progress-bar">
                            <div className="task-progress-fill" style={{ width: `${percent}%` }} />
                        </div>
                        <div className="task-natural-container" style={{ background: 'transparent', padding: 0, margin: 0, borderLeft: 'none' }}>
                            {parsedTasks.map((task: string, idx: number) => {
                                const isCompleted = /\[x\]/i.test(task) || (task.includes('✅') && !task.includes('❌'));
                                const isInProgress = !isCompleted && (/\[\/\]/i.test(task) || task.includes('🔄'));
                                // Strip leading markers: `- [x]`, `- [/]`, `- [ ]`, `- `, `1. `, plus trailing ✅/🔄 emoji
                                const cleanText = task
                                    .replace(/^\s*(?:\d+\.\s+|-\s+)?(?:\[(?:x|\/| )\]\s+)/i, '')
                                    .replace(/^\s*[-*]\s+/, '')
                                    .replace(/✅|🔄|❌/g, '')
                                    .trim();
                                const iconColor = isCompleted ? 'var(--vscode-testing-iconPassed)' : isInProgress ? 'var(--vscode-charts-blue)' : 'var(--vscode-descriptionForeground)';
                                return (
                                    <div key={idx} className={`task-natural-item ${isCompleted ? 'completed' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <div className="task-icon" style={{ 
                                            flexShrink: 0, 
                                            width: '18px', 
                                            display: 'flex', 
                                            justifyContent: 'center',
                                            fontSize: '14px',
                                            color: iconColor
                                        }}>
                                            {isCompleted ? '✓' : isInProgress ? '●' : '○'}
                                        </div>
                                        <div className="task-text" style={{ flex: 1, textDecoration: isCompleted ? 'line-through' : 'none', opacity: isCompleted ? 0.6 : 1 }}>
                                            <ReactMarkdown
                                                children={cleanText}
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    ...markdownComponents,
                                                    p: ({node, ...props}) => <span style={{margin: 0, display: 'inline'}} {...props} />
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }

        // Boxed fallback for other agents
        return (
            <div className="message-group" style={{ marginBottom: 8, width: '100%' }}>
                <div className="message model-message" style={{ padding: '12px', background: 'var(--vscode-editor-background)', border: '1px solid var(--vscode-widget-border)', borderRadius: 6, width: '100%' }}>
                    <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="codicon codicon-checklist" />
                        <span>Task List</span>
                    </div>
                    <div className="task-list" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {parsedTasks.map((task: string, idx: number) => {
                            const isCompleted = /\[x\]/i.test(task) || (task.includes('✅') && !task.includes('❌')); // simplistic check
                            const cleanText = task.replace(/^\s*(?:-|\d+\.|\[ \]|\[x\]|\[\/\])\s*/i, '').replace(/✅/g, '').trim();
                            // Render Task Item with Markdown
                            return (
                                <div key={idx} style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 8, 
                                    opacity: isCompleted ? 0.6 : 1,
                                    textDecoration: isCompleted ? 'line-through' : 'none',
                                    marginBottom: '4px'
                                }}>
                                    <div style={{ 
                                        flexShrink: 0, 
                                        width: '18px', 
                                        display: 'flex', 
                                        justifyContent: 'center',
                                        fontSize: '14px',
                                        color: isCompleted ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-descriptionForeground)' 
                                    }}>
                                        {isCompleted ? '✓' : '○'}
                                    </div>
                                    <div className="markdown-content task-content" style={{ flex: 1 }}>
                                        <ReactMarkdown
                                            children={cleanText}
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                ...markdownComponents,
                                                p: ({node, ...props}) => <span style={{margin: 0, display: 'inline'}} {...props} />
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // codeEditFile: 파일 생성/수정 카드 (SDK 표준 UI 구조)
    if ((message as any).kind === 'codeEditFile') {
        const baseName = (message.filePath || '').split(/[\\\/]/).pop() || message.title || 'File';
        const relativePath = (message as any).relativePath || (message.filePath || '');
        // Determine status text and badge
        const isEdit = (message as any).suggestionType === 'edit-file' || (message as any).description === 'File updated';
        const badgeText = isEdit ? 'Modified' : 'Created';
        
        const lintSummary = message.lintSummary;
        const hasLintErrors = lintSummary && !lintSummary.includes('0 lint');
        const leftStatusText = lintSummary;

        // Calculate diff stats
        const diffStats = useMemo(() => {
            if (!message.diff || !message.diff.originalCode || !message.diff.modifiedCode) return null;
            try {
                const changes = diffLines(message.diff.originalCode, message.diff.modifiedCode);
                let added = 0;
                let removed = 0;
                changes.forEach((part: any) => {
                    if (part.added) added += part.count || 0;
                    if (part.removed) removed += part.count || 0;
                });
                return { added, removed };
            } catch (e) {
                return null;
            }
        }, [message.diff]);
        
        return (
            <div className="message-group" style={{ marginBottom: 8, width: '100%' }}>
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
                                        fontSize: '14px',
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

                        {/* 두 번째 줄: lint errors (좌) + Diff Stats + Created/Modified 태그 (우) */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {hasLintErrors && (
                                    <>
                                        <span className="codicon codicon-warning" style={{ fontSize: 14, color: 'var(--vscode-errorForeground)' }} />
                                        <div className="markdown-content" style={{ fontSize: '11px', color: 'var(--vscode-errorForeground)' }}>
                                            <ReactMarkdown
                                                children={leftStatusText || ''}
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    ...markdownComponents,
                                                    p: ({node, ...props}) => <p style={{margin: 0}} {...props} />
                                                }}
                                            />
                                        </div>
                                    </>
                                )}
                                {!hasLintErrors && leftStatusText && (
                                     <>
                                        <span className="codicon codicon-check" style={{ fontSize: 14, color: 'var(--vscode-testing-iconPassed)' }} />
                                        <div className="markdown-content" style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
                                                <ReactMarkdown
                                                children={leftStatusText}
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    ...markdownComponents,
                                                    p: ({node, ...props}) => <p style={{margin: 0}} {...props} />
                                                }}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {diffStats && (
                                    <div style={{ fontSize: '11px', display: 'flex', gap: 6 }}>
                                        <span style={{ color: 'var(--vscode-gitDecoration-addedResourceForeground)' }}>+{diffStats.added}</span>
                                        <span style={{ color: 'var(--vscode-gitDecoration-deletedResourceForeground)' }}>-{diffStats.removed}</span>
                                    </div>
                                )}
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
                        
                        {/* Actions Row Removed */}
                    </div>
                </div>
            </div>
        );
    }

	return (
		<div className={`message-item ${isModel ? 'ai' : 'user'}`}>
            <style>{`
                .sender-info {
                    display: flex;
                    justify-content: space-between;
                    font-size: 14px;
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
                    font-weight: normal;
                }
                .thought-toggle {
                    cursor: pointer;
                    margin: 6px 0;
                    font-size: 14px;
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
                    font-size: 14px;
                    color: var(--vscode-editorCodeLens-foreground);
                }
                .agent-toggle {
                    cursor: pointer;
                    padding: 2px 0;
                    font-size: 14px;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 0;
                }
                .agent-toggle .codicon {
                    font-size: 14px;
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
                    style={{ marginLeft: 0 }}
                >
                    <span className={`codicon ${showAgentBubble ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
                    <span style={{color: 'var(--vscode-descriptionForeground)', fontWeight: 'normal'}}>
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
                            fontSize: 14
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
                                                    padding: '2px 0', paddingLeft: 4, paddingRight: 3, fontSize: 14,
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
            <div className={`message ${isModel ? 'model-message' : 'user-message'}`} style={{ position: 'relative' }}>
                {!isModel && onRollback && (
                    <div className="rollback-btn" 
                         title="Time Travel: Rollback to this message"
                         onClick={() => onRollback(message.messageId, message.timestamp || '')}
                         style={{
                             position: 'absolute',
                             top: -8,
                             left: -8,
                             width: 20,
                             height: 20,
                             borderRadius: '50%',
                             background: 'var(--vscode-editor-background)',
                             border: '1px solid var(--vscode-widget-border)',
                             color: 'var(--vscode-descriptionForeground)',
                             display: 'flex',
                             alignItems: 'center',
                             justifyContent: 'center',
                             cursor: 'pointer',
                             opacity: 0, // Hover to show handled via CSS in MainView or simpler inline hover
                             transition: 'opacity 0.2s',
                             zIndex: 10
                         }}
                         onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                         onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                    >
                        <span className="codicon codicon-history" style={{ fontSize: '12px' }} />
                    </div>
                )}
                <div className="sender-info">
                    {/* Agent 이름 제거 - bubble 외부에만 표시 */}
                    <span className="timestamp">{formatTimestamp(message.timestamp)}</span>
                </div>
                    <ReactMarkdown
                        children={(message.text || '').split('\n').map(l => l.trimEnd() + '  ').join('\n')}
                        remarkPlugins={[remarkGfm]}
                        components={{
                            ...markdownComponents,
                            p: ({node, ...props}) => <p style={{margin: '0 0 8px 0', whiteSpace: 'pre-wrap'}} {...props} />,
                            ul: ({node, ...props}) => <ul style={{paddingLeft: '10px', margin: '4px 0'}} {...props} />,
                            ol: ({node, ...props}) => <ol style={{paddingLeft: '10px', margin: '4px 0'}} {...props} />,
                            li: ({node, ...props}) => <li style={{margin: '2px 0'}} {...props} />
                        }}
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
                                    <VSCodeButton
                                        onClick={() => {
                                            vscodeService.postMessage({
                                                command: 'acceptUroborosMode',
                                                payload: { userText: proposal.userText }
                                            });
                                            if (onAction) onAction();
                                        }}
                                    >
                                        <span slot="start" className="codicon codicon-check" />
                                        Approve
                                    </VSCodeButton>
                                    <VSCodeButton
                                        appearance="secondary"
                                        onClick={() => {
                                            vscodeService.postMessage({
                                                command: 'declineUroborosMode',
                                                payload: { userText: proposal.userText, suppressForSession: false }
                                            });
                                            if (onAction) onAction();
                                        }}
                                    >
                                        <span slot="start" className="codicon codicon-close" />
                                        Decline
                                    </VSCodeButton>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        onChange={() => {
                                            vscodeService.postMessage({
                                                command: 'declineUroborosMode',
                                                payload: { userText: proposal.userText, suppressForSession: true }
                                            });
                                            if (onAction) onAction();
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
                                    <VSCodeButton
                                        key={idx}
                                        appearance={isSecondary ? "secondary" : "primary"}
                                        onClick={() => {
                                            vscodeService.postMessage({
                                                command: btn.command,
                                                payload: btn.payload
                                            });
                                            if (onAction) onAction();
                                        }}
                                        style={isDanger ? { backgroundColor: 'var(--vscode-errorForeground)', color: 'var(--vscode-button-foreground)' } : {}}
                                    >
                                        {btn.label}
                                    </VSCodeButton>
                                );
                            })}
                        </div>
                    )}
                    {message.diff && (
                        <div>
                            {/* Hidden diff body in favor of simple stats in the header */}
                            <div className="action-buttons" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
                                <VSCodeButton appearance="secondary" onClick={() => { if (!message.diff) return; vscodeService.postMessage({
                                    command: 'showDiff',
                                    originalCode: message.diff.originalCode,
                                    modifiedCode: message.diff.modifiedCode,
                                    title: message.diff.title || message.diff.filePath,
                                }); }}>Edit</VSCodeButton>
                                <VSCodeButton onClick={() => { if (!message.diff) return; vscodeService.postMessage({
                                    command: 'acceptChange',
                                    filePath: message.diff.filePath,
                                    originalCode: message.diff.originalCode,
                                    modifiedCode: message.diff.modifiedCode,
                                    suggestionType: message.diff.suggestionType,
                                }); }}>Approve</VSCodeButton>
                                <VSCodeButton appearance="secondary" onClick={() => { if (!message.diff) return; vscodeService.postMessage({
                                    command: 'declineChange',
                                    filePath: message.diff.filePath,
                                }); }}>Decline</VSCodeButton>
                                <VSCodeButton appearance="secondary" onClick={() => { if (!message.diff) return; vscodeService.postMessage({
                                    command: 'acceptAlways',
                                    filePath: message.diff.filePath,
                                    originalCode: message.diff.originalCode,
                                    modifiedCode: message.diff.modifiedCode,
                                    suggestionType: message.diff.suggestionType,
                                }); }}>Accept Always</VSCodeButton>
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>
	);
};
