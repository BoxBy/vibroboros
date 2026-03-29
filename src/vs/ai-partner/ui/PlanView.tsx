import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { vscodeService } from './services/vscode';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

export interface PlanStep {
    description: string;
    status: 'pending' | 'in-progress' | 'completed' | 'error';
}

interface PlanViewProps {
    plan: PlanStep[];
    isAutonomousMode: boolean;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

const getStatusIcon = (status: PlanStep['status']) => {
    switch (status) {
        case 'completed':
            return <span style={{ color: 'var(--vscode-testing-iconPassed)', fontSize: 14 }}>✓</span>;
        case 'in-progress':
            return <span style={{ color: 'var(--vscode-charts-blue)', fontSize: 14 }}>●</span>;
        case 'error':
            return <span style={{ color: 'var(--vscode-testing-iconFailed)', fontSize: 14 }}>✗</span>;
        case 'pending':
        default:
            return <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: 14 }}>○</span>;
    }
};

export const PlanView: React.FC<PlanViewProps> = ({ plan, isAutonomousMode, isCollapsed, onToggleCollapse }) => {
    if (!plan || plan.length === 0) {
        return null;
    }

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<string[]>(plan.map(p => p.description));

    const handleApprove = () => {
        vscodeService.postMessage({ command: 'userQuery', query: 'yes' });
    };

    const handleDecline = () => {
        vscodeService.postMessage({ command: 'userQuery', query: 'no' });
    };

    const isPending = plan.some(step => step.status === 'pending');

    const handleEdit = () => {
        setDraft(plan.map(p => p.description));
        setEditing(true);
    };

    const handleCancelEdit = () => {
        setEditing(false);
        setDraft(plan.map(p => p.description));
    };

    const handleSaveEdit = () => {
        const steps = draft.map(s => (s || '').trim()).filter(Boolean);
        vscodeService.postMessage({ command: 'updatePlanFromUI', payload: { steps } });
        setEditing(false);
    };

    const completedCount = plan.filter(s => s.status === 'completed').length;
    const visiblePlan = isCollapsed ? plan.filter(s => s.status === 'in-progress') : plan;

    return (
        <div className="plan-view-container plan-view" style={{
            border: '1px solid var(--vscode-widget-border)',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        }}>
            {/* Header: entire bar is clickable */}
            <div
                onClick={onToggleCollapse}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--vscode-titleBar-activeBackground)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderBottom: isCollapsed ? 'none' : '1px solid var(--vscode-widget-border)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
                    <span className={`codicon ${isCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'}`} style={{ fontSize: 12 }} />
                    <span>Execution Plan</span>
                    <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 'normal' }}>
                        ({completedCount}/{plan.length})
                    </span>
                </div>
                <span style={{ fontSize: 11, opacity: 0.6 }}>
                    {isCollapsed ? 'Show All' : 'Minimize'}
                </span>
            </div>

            {!isCollapsed && (
                <div style={{ padding: '8px 12px' }}>
                    {editing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <ul className="plan-steps" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {draft.map((text, i) => (
                                    <li key={i} className="plan-step editing" style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: 8 }}>
                                        <div className="plan-step-icon" style={{ flexShrink: 0 }}>{getStatusIcon('pending')}</div>
                                        <input
                                            value={text}
                                            onChange={e => setDraft(prev => prev.map((t, idx) => idx === i ? e.target.value : t))}
                                            style={{ width: '100%', background: 'var(--vscode-input-background)', color: 'var(--vscode-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: 4, padding: '4px 6px' }}
                                        />
                                    </li>
                                ))}
                            </ul>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <VSCodeButton appearance="secondary" onClick={() => setDraft(d => [...d, ''])}>Add Step</VSCodeButton>
                                <VSCodeButton onClick={handleSaveEdit}>Save</VSCodeButton>
                                <VSCodeButton appearance="secondary" onClick={handleCancelEdit}>Cancel</VSCodeButton>
                            </div>
                        </div>
                    ) : (
                        <>
                            <ul className="plan-steps" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto', paddingLeft: 4 }}>
                                {visiblePlan.map((step, index) => (
                                    <li
                                        key={index}
                                        className={`plan-step ${step.status}`}
                                        style={{ display: 'flex', cursor: (isAutonomousMode && step.status === 'pending') ? 'grab' : 'default', alignItems: 'flex-start', gap: '8px' }}
                                        draggable={isAutonomousMode && step.status === 'pending'}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('text/plain', index.toString());
                                            e.dataTransfer.effectAllowed = 'move';
                                        }}
                                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                                            const toIndex = index;
                                            if (fromIndex === toIndex) return;
                                            const newPlan = [...plan];
                                            const [movedItem] = newPlan.splice(fromIndex, 1);
                                            newPlan.splice(toIndex, 0, movedItem);
                                            vscodeService.postMessage({ command: 'updatePlanFromUI', payload: { steps: newPlan.map(s => s.description) } });
                                        }}
                                    >
                                        <div className="plan-step-icon" style={{ marginTop: 2, flexShrink: 0 }}>{getStatusIcon(step.status)}</div>
                                        <div className="plan-step-text markdown-content" style={{
                                            textDecoration: step.status === 'completed' ? 'line-through' : 'none',
                                            color: step.status === 'error' ? 'var(--vscode-errorForeground)' : 'inherit',
                                            flex: 1,
                                            opacity: step.status === 'completed' ? 0.6 : 1,
                                            wordWrap: 'break-word',
                                            overflowWrap: 'anywhere'
                                        }}>
                                            <ReactMarkdown
                                                children={step.description}
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    p: ({ node, ...props }) => <span style={{ margin: 0, display: 'inline' }} {...props} />
                                                }}
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {isAutonomousMode && isPending && (
                                <div className="plan-actions" style={{ display: 'flex', gap: '8px', marginTop: 8 }}>
                                    <VSCodeButton onClick={handleApprove}>Approve</VSCodeButton>
                                    <VSCodeButton appearance="secondary" onClick={handleDecline}>Decline</VSCodeButton>
                                    <VSCodeButton appearance="secondary" onClick={handleEdit}>Edit</VSCodeButton>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
