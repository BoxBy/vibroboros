import React, { useRef, useState, useEffect } from 'react';
import { VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react';


interface ModelInfo {
    id: string;
    maxContext?: number;
}

interface HeaderProps {
    onNewChat: () => void;
    onShowHistory: () => void;
    onShowSettings: () => void;
    isAutonomousMode: boolean;
    onToggleAutonomousMode: (checked: boolean) => void;
    model?: string;
    models?: ModelInfo[];
    modelTooltip?: string;
    onChangeModel?: (model: string) => void;
    profiles?: Array<{ id: string; name: string }>;
    activeProfileId?: string | null;
    onChangeProfile?: (profileId: string) => void;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
    isLoading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onNewChat, onShowHistory, onShowSettings, isAutonomousMode, onToggleAutonomousMode, model, models = [], modelTooltip, onChangeModel, profiles = [], activeProfileId, onChangeProfile, usage, isLoading }) => {
    const [showProfilePopup, setShowProfilePopup] = useState(false);
    const [showModelPopup, setShowModelPopup] = useState(false);
    const [modelDraft, setModelDraft] = useState(model ?? '');
    const profileAnchorRef = useRef<HTMLDivElement | null>(null);
    const modelAnchorRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => setModelDraft(model ?? ''), [model]);
    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            const t = e.target as Node;
            if (profileAnchorRef.current && !profileAnchorRef.current.contains(t)) setShowProfilePopup(false);
            if (modelAnchorRef.current && !modelAnchorRef.current.contains(t)) setShowModelPopup(false);
        };
        document.addEventListener('click', onDocClick);
        return () => document.removeEventListener('click', onDocClick);
    }, []);
    // Helpers for display labels
    const activeProfileName = (() => {
        const active = profiles.find(p => p.id === (activeProfileId ?? ''));
        return active ? active.name : 'Profile';
    })();
    const displayModelLabel = (() => {
        const name = (modelDraft || model || '').trim();
        if (!name) return 'Model';
        // If very long (common in local models), avoid clutter: show generic label, keep tooltip
        if (name.length > 32) return 'Model';
        // Truncate middle if modestly long
        if (name.length > 24) {
            const head = name.slice(0, 12);
            const tail = name.slice(-10);
            return `${head}…${tail}`;
        }
        return name;
    })();

    return (
        <header className="header">
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <h1 className="header-title" style={{ marginRight: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            Viper
                            {isLoading && <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: '14px' }} />}
                        </h1>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
                        <div ref={profileAnchorRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowModelPopup(false); setShowProfilePopup(v => !v); }}>
                            <span style={{ fontSize: 12, opacity: 0.8 }}>{activeProfileName}</span>
                            <span className="codicon codicon-chevron-down" style={{ fontSize: 10, opacity: 0.8 }} />
                            {showProfilePopup && (
                                <div className="header-popup" onClick={(e) => e.stopPropagation()} onMouseLeave={() => setShowProfilePopup(false)}>
                                    {profiles.length === 0 && <div className="popup-item" style={{ opacity: 0.8 }}>No profiles</div>}
                                    {profiles.map(p => (
                                        <div
                                            key={p.id}
                                            className="popup-item"
                                            style={{ fontWeight: activeProfileId === p.id ? 600 as any : 400 as any, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                            onClick={() => { onChangeProfile?.(p.id); setShowProfilePopup(false); }}
                                        >
                                            <span>{p.name}</span>
                                            {activeProfileId === p.id && <span className="codicon codicon-check" />}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div ref={modelAnchorRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowProfilePopup(false); setShowModelPopup(v => !v); }}>
                            <span style={{ fontSize: 12, opacity: 0.8 }} title={modelTooltip || (modelDraft || model || '') || undefined}>{displayModelLabel}</span>
                            <span className="codicon codicon-chevron-down" style={{ fontSize: 10, opacity: 0.8 }} />
                            {showModelPopup && (
                                <div className="header-popup" onClick={(e) => e.stopPropagation()} onMouseLeave={() => setShowModelPopup(false)}>
                                    <input
                                        className="vscode-text-field popup-input"
                                        value={modelDraft}
                                        onChange={(e: any) => setModelDraft(e.target.value)}
                                        onKeyDown={(e: any) => {
                                            if (e.key === 'Enter') { onChangeModel?.(modelDraft); setShowModelPopup(false); }
                                        }}
                                        placeholder={models.length ? 'Select or type a model' : 'Type a model'}
                                    />
                                    {models.length > 0 && (
                                        <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                                            {models.map(m => (
                                                <div key={m.id} className="popup-item" style={{ fontWeight: (model === m.id || modelDraft === m.id) ? 600 as any : 400 as any, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => { onChangeModel?.(m.id); setShowModelPopup(false); }}>
                                                    <span>{m.id}</span>
                                                    {m.maxContext && (
                                                        <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '8px' }}>
                                                            {m.maxContext >= 1000 ? `${Math.round(m.maxContext / 1000)}k` : m.maxContext} ctx
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {usage && typeof usage.total_tokens === 'number' && (
                    <div title={`Tokens — total: ${usage.total_tokens}${typeof usage.prompt_tokens==='number'?`, prompt: ${usage.prompt_tokens}`:''}${typeof usage.completion_tokens==='number'?`, completion: ${usage.completion_tokens}`:''}`}
                         style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--vscode-descriptionForeground)'
                        }} />
                        <span style={{ fontSize: 12, opacity: 0.8 }}>{usage.total_tokens}</span>
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title={"Uroboros Mode:\n- Brainstorm a detailed end-to-end plan with you\n- After you approve, Viper auto-executes the plan"}>
                    <VSCodeCheckbox 
                        checked={isAutonomousMode} 
                        onChange={(e: any) => onToggleAutonomousMode(e.target.checked)} 
                        id="uroboros-mode"
                        style={{ fontSize: '12px' }}
                    >
                        Uroboros Mode
                    </VSCodeCheckbox>
                </div>
                <div className="icon-button" onClick={onNewChat} title="New Chat" role="button" tabIndex={0}>
                    <span className="codicon codicon-comment-add" />
                </div>
                <div className="icon-button" onClick={onShowHistory} title="History" role="button" tabIndex={0}>
                    <span className="codicon codicon-history" />
                </div>
                <div className="icon-button" onClick={onShowSettings} title="Settings" role="button" tabIndex={0}>
                    <span className="codicon codicon-gear" />
                </div>
            </div>
        </div>
        </header>
    );
};