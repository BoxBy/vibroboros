import React, { useState, useEffect, useRef } from 'react';
import { vscodeService } from './services/vscode';

interface InputAreaProps {
	onSendMessage: (message: string) => void;
	disabled?: boolean;
    commands: { command: string, description: string }[];
    attachments?: Array<{ type: 'file' | 'folder' | 'code' | 'mcp' | 'browser'; uri?: string; label: string; content?: string }>;
    onRemoveAttachment?: (label: string) => void;
    onClearAttachments?: () => void;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSendMessage, disabled, commands, attachments = [], onRemoveAttachment, onClearAttachments }) => {
	const [message, setMessage] = useState('');
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const directoryInputRef = useRef<HTMLInputElement>(null);
    const [suggestions, setSuggestions] = useState<{ command: string, description: string }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const attachMenuRef = useRef<HTMLDivElement>(null);
    const [showFilePicker, setShowFilePicker] = useState(false);
    const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);
    const [fileList, setFileList] = useState<Array<{ name: string; path: string; type: 'file' | 'directory' }>>([]);
    const [currentPath, setCurrentPath] = useState<string>('');
    const atCommandItems: { command: string, description: string }[] = [
        { command: '@file', description: 'Attach file' },
        { command: '@folder', description: 'Attach folder' },
        { command: '@mcp', description: 'Attach MCP resource' },
        { command: '@browser', description: 'Attach browser target/URL' },
    ];

	const handleSend = () => {
		if (message.trim() && !disabled) {
			onSendMessage(message);
			setMessage('');
            setShowSuggestions(false);
            onClearAttachments?.();
		}
	};

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setMessage(value);

        if (value.startsWith('/')) {
            const searchTerm = value.toLowerCase();
            const filteredCommands = commands.filter(c =>
                c.command.toLowerCase().startsWith(searchTerm)
            );
            setSuggestions(filteredCommands);
            setShowSuggestions(filteredCommands.length > 0);
            setActiveSuggestionIndex(0);
            return;
        }

        if (value.startsWith('@')) {
            const searchTerm = value.toLowerCase().trimEnd();
            const filtered = atCommandItems.filter(c => c.command.toLowerCase().startsWith(searchTerm));
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
            setActiveSuggestionIndex(0);
            return;
        }

        setShowSuggestions(false);
    };

	const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const items = event.clipboardData.items;
		for (let i = 0; i < items.length; i++) {
			if (items[i].type.indexOf('image') !== -1) {
				event.preventDefault();
				const blob = items[i].getAsFile();
				if (blob) {
					const reader = new FileReader();
					reader.onload = (e) => {
						const base64 = e.target?.result as string;
						vscodeService.postMessage({
							command: 'insertAttachment',
							payload: [{ type: 'file', label: blob.name || 'pasted-image.png', content: base64 }]
						});
					};
					reader.readAsDataURL(blob);
				}
				break;
			}
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (showSuggestions) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveSuggestionIndex(prevIndex => (prevIndex + 1) % suggestions.length);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveSuggestionIndex(prevIndex => (prevIndex - 1 + suggestions.length) % suggestions.length);
            } else if (event.key === 'Tab') {
                event.preventDefault();
                if (suggestions.length > 0) {
                    const pick = suggestions[activeSuggestionIndex];
                    handlePickSuggestion(pick.command);
                }
            } else if (event.key === 'Enter') {
                event.preventDefault();
                if (suggestions.length > 0) {
                    const pick = suggestions[activeSuggestionIndex];
                    handlePickSuggestion(pick.command);
                }
                return; // Don't send message when selecting suggestion
            } else if (event.key === 'Escape') {
                setShowSuggestions(false);
            }
            return; // Don't process other keys when suggestions are shown
        }

        if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	};

    // Update suggestions when commands list loads/updates
    useEffect(() => {
        if (message.startsWith('/')) {
            const searchTerm = message.toLowerCase();
            const filteredCommands = commands.filter(c =>
                c.command.toLowerCase().startsWith(searchTerm)
            );
            setSuggestions(filteredCommands);
            setShowSuggestions(filteredCommands.length > 0);
        }
    }, [commands, message]);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			// Reset height to allow shrink
			textarea.style.height = '0px';
			const scrollHeight = textarea.scrollHeight;
			// Set new height based on content, clamped between 28px and 200px
			const newHeight = Math.min(Math.max(scrollHeight, 28), 200);
			textarea.style.height = `${newHeight}px`;
		}
	}, [message]);

	// Set initial height on mount
	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea && !message) {
			textarea.style.height = '28px';
		}
	}, []);

	// Close attach menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
				setShowAttachMenu(false);
			}
		};
		if (showAttachMenu) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	}, [showAttachMenu]);

	// Listen for workspace files list response
	useEffect(() => {
		if (!showFilePicker && !showDirectoryPicker) return;

		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			if (message.command === 'workspaceFilesList') {
				setFileList(message.payload?.files || []);
			}
		};
		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [showFilePicker, showDirectoryPicker]);

    const handlePickSuggestion = (cmd: string) => {
        if (cmd === '@file') {
            vscodeService.postMessage({ command: 'requestPick', payload: { kind: 'file' } });
        } else if (cmd === '@folder') {
            vscodeService.postMessage({ command: 'requestPick', payload: { kind: 'folder' } });
        } else if (cmd === '@mcp') {
            vscodeService.postMessage({ command: 'insertAttachment', payload: [{ type: 'mcp', label: 'MCP (configure...)' }] });
        } else if (cmd === '@browser') {
            vscodeService.postMessage({ command: 'insertAttachment', payload: [{ type: 'browser', label: 'Browser (enter URL...)' }] });
        } else {
            setMessage(cmd);
        }
        setShowSuggestions(false);
        textareaRef.current?.focus();
    };

	return (
        <div className="input-container">
            <div className="input-box-wrapper">
                {attachments.length > 0 && (
                    <div className="attachment-list">
                        {attachments.map(a => {
                            const isImage = a.type === 'file' && (
                                (a.content && a.content.startsWith('data:image')) ||
                                /\.(jpg|jpeg|png|gif|webp)$/i.test(a.label)
                            );
                            return (
                                <div
                                    key={a.label}
                                    title={a.uri || a.label}
                                    className={`attachment-chip ${a.uri ? 'clickable' : ''} ${isImage ? 'image-attachment' : ''}`}
                                    onClick={() => {
                                        try {
                                            if (a.uri) {
                                                vscodeService.postMessage({ command: 'openAttachment', payload: { uri: a.uri } });
                                            }
                                        } catch {}
                                    }}
                                >
                                    {isImage && a.content ? (
                                        <img src={a.content} className="attachment-preview-img" alt={a.label} />
                                    ) : (
                                        <span className={`codicon ${a.type === 'file' ? 'codicon-file' : a.type === 'folder' ? 'codicon-folder' : a.type === 'code' ? 'codicon-code' : 'codicon-link'}`} style={{ fontSize: 14 }} />
                                    )}
                                    {!isImage && <span style={{ lineHeight: '18px', fontWeight: 500 }}>{a.label}</span>}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveAttachment?.(a.label);
                                        }}
                                        title="Remove"
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            color: 'var(--vscode-icon-foreground)',
                                            marginLeft: 4,
                                            padding: '0 2px',
                                            lineHeight: 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            fontSize: 16
                                        }}
                                    >×</button>
                                </div>
                            );
                        })}
                    </div>
                )}
                <div className="input-area">
                    <div style={{ position: 'relative' }} ref={attachMenuRef}>
                        <button
                            onClick={() => setShowAttachMenu(v => !v)}
                            title="Add context"
                            disabled={disabled}
                            className="input-attach-btn"
                        >
                            <span className="codicon codicon-add"></span>
                        </button>
                        {showAttachMenu && (
                            <div className="context-menu">
                                <div className="context-menu-header">
                                    Add context
                                </div>
                                
                                <button
                                    onClick={() => {
                                        imageInputRef.current?.click();
                                        setShowAttachMenu(false);
                                    }}
                                    className="context-menu-item"
                                >
                                    <span className="codicon codicon-file-media" />
                                    <span>Images</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setShowAttachMenu(false);
                                        setMessage(prev => prev + '@');
                                        textareaRef.current?.focus();
                                    }}
                                    className="context-menu-item"
                                >
                                    <span className="codicon codicon-mention" />
                                    <span>Mentions</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setShowAttachMenu(false);
                                        setMessage(prev => prev + '/workflow ');
                                        textareaRef.current?.focus();
                                    }}
                                    className="context-menu-item"
                                >
                                    <span className="codicon codicon-symbol-event" />
                                    <span>Workflows</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                    const base64 = ev.target?.result as string;
                                    const isImage = file.type.startsWith('image/');
                                    vscodeService.postMessage({
                                        command: 'insertAttachment',
                                        payload: [{ type: 'file', label: file.name, content: isImage ? base64 : undefined, uri: isImage ? undefined : `file://${(file as any).path || file.name}` }]
                                    });
                                };
                                reader.readAsDataURL(file);
                            }
                            e.target.value = '';
                        }}
                    />
                    <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                    const base64 = ev.target?.result as string;
                                    vscodeService.postMessage({
                                        command: 'insertAttachment',
                                        payload: [{ type: 'file', label: file.name, content: base64 }]
                                    });
                                };
                                reader.readAsDataURL(file);
                            }
                            e.target.value = '';
                        }}
                    />
                    <input
                        ref={directoryInputRef}
                        type="file"
                        {...({ webkitdirectory: 'true' } as any)}
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                                const firstFile = files[0];
                                const path = (firstFile as any).path || firstFile.name;
                                const directoryPath = path.substring(0, path.lastIndexOf('/') || path.lastIndexOf('\\'));
                                vscodeService.postMessage({
                                    command: 'insertAttachment',
                                    payload: [{ type: 'folder', label: directoryPath.split(/[/\\]/).pop() || 'Folder', uri: `file://${directoryPath}` }]
                                });
                            }
                            e.target.value = '';
                        }}
                    />
                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder="Type a message, or start a command with '/' or '@'..."
                        rows={1}
                        disabled={disabled}
                    />
                    <button onClick={handleSend} title="Send" disabled={disabled || !message.trim()}>
                        <span className="codicon codicon-send" />
                    </button>
                </div>
            </div>
            {showSuggestions && suggestions.length > 0 && (
                <div className="suggestions-popup">
                    {suggestions.map((s, index) => (
                        <div
                            key={s.command}
                            className={`suggestion-item ${index === activeSuggestionIndex ? 'active' : ''}`}
                            onClick={() => {
                                handlePickSuggestion(s.command);
                            }}
                        >
                            <span className="suggestion-command">{s.command}</span>
                            <span className="suggestion-description">{s.description}</span>
                        </div>
                    ))}
                </div>
            )}
            {(showFilePicker || showDirectoryPicker) && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10001
                }} onClick={() => {
                    setShowFilePicker(false);
                    setShowDirectoryPicker(false);
                    setFileList([]);
                    setCurrentPath('');
                }}>
                    <div style={{
                        background: 'var(--vscode-editorWidget-background)',
                        border: '1px solid var(--vscode-editorWidget-border)',
                        borderRadius: 8,
                        padding: '16px',
                        maxWidth: '600px',
                        width: '90%',
                        maxHeight: '70vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
                    }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3 style={{ margin: 0 }}>Select {showFilePicker ? 'File' : 'Directory'}</h3>
                            <button
                                onClick={() => {
                                    setShowFilePicker(false);
                                    setShowDirectoryPicker(false);
                                    setFileList([]);
                                    setCurrentPath('');
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--vscode-foreground)',
                                    cursor: 'pointer',
                                    fontSize: '18px',
                                    padding: '4px 8px'
                                }}
                            >×</button>
                        </div>
                        {currentPath && (
                            <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    onClick={() => {
                                        const parentPath = currentPath.split(/[\\/]/).slice(0, -1).join('/');
                                        setCurrentPath(parentPath);
                                        vscodeService.postMessage({
                                            command: 'listWorkspaceFiles',
                                            payload: { path: parentPath, type: showDirectoryPicker ? 'directory' : undefined }
                                        });
                                    }}
                                    style={{
                                        background: 'var(--vscode-button-secondaryBackground)',
                                        color: 'var(--vscode-button-secondaryForeground)',
                                        border: 'none',
                                        borderRadius: 4,
                                        padding: '4px 8px',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                    }}
                                >
                                    <span className="codicon codicon-arrow-up" /> Up
                                </button>
                                <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>{currentPath || '/'}</span>
                            </div>
                        )}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            border: '1px solid var(--vscode-editorWidget-border)',
                            borderRadius: 4,
                            padding: '8px',
                            minHeight: '300px',
                            maxHeight: '400px'
                        }}>
                            {fileList.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--vscode-descriptionForeground)', padding: '20px' }}>
                                    Loading...
                                </div>
                            ) : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {fileList.map((item, idx) => (
                                        <li key={idx}>
                                            <button
                                                onClick={() => {
                                                    if (item.type === 'directory') {
                                                        const newPath = item.path;
                                                        setCurrentPath(newPath);
                                                        vscodeService.postMessage({
                                                            command: 'listWorkspaceFiles',
                                                            payload: { path: newPath, type: showDirectoryPicker ? 'directory' : undefined }
                                                        });
                                                    } else if (showFilePicker && item.type === 'file') {
                                                        vscodeService.postMessage({
                                                            command: 'insertAttachment',
                                                            payload: [{ type: 'file', label: item.name, uri: `file://${item.path}` }]
                                                        });
                                                        setShowFilePicker(false);
                                                        setFileList([]);
                                                        setCurrentPath('');
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    textAlign: 'left',
                                                    padding: '6px 8px',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: 'var(--vscode-foreground)',
                                                    cursor: 'pointer',
                                                    borderRadius: 4,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <span className={`codicon ${item.type === 'directory' ? 'codicon-folder' : 'codicon-file'}`} />
                                                <span>{item.name}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        {showDirectoryPicker && (
                            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => {
                                        if (currentPath) {
                                            vscodeService.postMessage({
                                                command: 'insertAttachment',
                                                payload: [{ type: 'folder', label: currentPath.split(/[\\/]/).pop() || 'Folder', uri: `file://${currentPath}` }]
                                            });
                                            setShowDirectoryPicker(false);
                                            setFileList([]);
                                            setCurrentPath('');
                                        }
                                    }}
                                    disabled={!currentPath}
                                    style={{
                                        padding: '6px 12px',
                                        background: currentPath ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)',
                                        color: currentPath ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)',
                                        border: 'none',
                                        borderRadius: 4,
                                        cursor: currentPath ? 'pointer' : 'not-allowed'
                                    }}
                                >
                                    Select
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};