import React, { useState } from 'react';
import { vscodeService } from './services/vscode';

export interface PlanStep {
    description: string;
    status: 'pending' | 'in-progress' | 'completed' | 'error';
}

interface PlanViewProps {
    plan: PlanStep[];
    isAutonomousMode: boolean;
}

const getStatusIcon = (status: PlanStep['status']) => {
    switch (status) {
        case 'completed':
            return <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>✓</span>;
        case 'in-progress':
            return <span style={{ color: 'var(--vscode-descriptionForeground)' }}>●</span>;
        case 'error':
            return <span style={{ color: 'var(--vscode-testing-iconFailed)' }}>✗</span>;
        case 'pending':
        default:
            return <span style={{ color: 'var(--vscode-descriptionForeground)' }}>●</span>;
    }
};

export const PlanView: React.FC<PlanViewProps> = ({ plan, isAutonomousMode }) => {
    if (!plan || plan.length === 0) {
        return null;
    }

    const [editing, setEditing] = useState(false);
    const [collapsed, setCollapsed] = useState(true); // 기본적으로 접혀있음
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

    // 접혔을 때는 현재 진행중인 step만 표시
    const visiblePlan = collapsed ? plan.filter(s => s.status === 'in-progress') : plan;

    return (
        <div className="plan-view-container plan-view">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h4 style={{ margin: 0 }}>Execution Plan {plan.length > 0 ? `(${plan.filter(s => s.status === 'completed').length}/${plan.length})` : ''}</h4>
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--vscode-foreground)',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                    }}
                    title={collapsed ? 'Expand' : 'Collapse'}
                >
                    <span className={`codicon ${collapsed ? 'codicon-chevron-down' : 'codicon-chevron-up'}`} />
                    <span style={{ fontSize: '12px' }}>{collapsed ? 'Show All' : 'Minimize'}</span>
                </button>
            </div>
            {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <ul className="plan-steps">
                        {draft.map((text, i) => (
                            <li key={i} className={`plan-step editing`}>
                                <div className="plan-step-icon">{getStatusIcon('pending')}</div>
                                <input
                                    value={text}
                                    onChange={e => setDraft(prev => prev.map((t, idx) => idx === i ? e.target.value : t))}
                                    style={{ width: '100%', background: 'var(--vscode-input-background)', color: 'var(--vscode-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: 4, padding: '4px 6px' }}
                                />
                            </li>
                        ))}
                    </ul>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setDraft(d => [...d, ''])} style={{ border: '1px solid var(--vscode-button-border)', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', padding: '4px 12px', cursor: 'pointer', borderRadius: '4px' }}>Add Step</button>
                        <button onClick={handleSaveEdit} style={{ border: '1px solid var(--vscode-button-border)', background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', padding: '4px 12px', cursor: 'pointer', borderRadius: '4px' }}>Save</button>
                        <button onClick={handleCancelEdit} style={{ border: '1px solid var(--vscode-button-border)', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', padding: '4px 12px', cursor: 'pointer', borderRadius: '4px' }}>Cancel</button>
                    </div>
                </div>
            ) : (
                <>
                    <ul className="plan-steps" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {visiblePlan.map((step, index) => (
                            <li 
                                key={index} 
                                className={`plan-step ${step.status}`}
                                draggable={isAutonomousMode && step.status === 'pending'} // Only allow dragging pending steps in autonomous mode (or edit mode)
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('text/plain', index.toString());
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                                    const toIndex = index;
                                    if (fromIndex === toIndex) return;

                                    // Create new array with swapped items
                                    const newPlan = [...plan];
                                    const [movedItem] = newPlan.splice(fromIndex, 1);
                                    newPlan.splice(toIndex, 0, movedItem);
                                    
                                    // Send update to extension
                                    // Note: We need to extract just descriptions or full objects? 
                                    // The updatePlanFromUI command expects list of descriptions usually.
                                    const steps = newPlan.map(s => s.description);
                                    vscodeService.postMessage({ command: 'updatePlanFromUI', payload: { steps } });
                                }}
                                style={{
                                    cursor: (isAutonomousMode && step.status === 'pending') ? 'grab' : 'default'
                                }}
                            >
                                <div className="plan-step-icon">{getStatusIcon(step.status)}</div>
                                <span className="plan-step-text" style={{ textDecoration: step.status === 'completed' ? 'line-through' : 'none', color: step.status === 'error' ? 'var(--vscode-errorForeground)' : 'inherit' }}>
                                    {step.description}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {isAutonomousMode && isPending && (
                        <div className="plan-actions" style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleApprove} style={{
                                border: '1px solid var(--vscode-button-border)',
                                background: 'var(--vscode-button-background)',
                                color: 'var(--vscode-button-foreground)',
                                padding: '4px 12px',
                                cursor: 'pointer',
                                borderRadius: '4px'
                            }}>Approve</button>
                            <button onClick={handleDecline} style={{
                                border: '1px solid var(--vscode-button-border)',
                                background: 'var(--vscode-button-secondaryBackground)',
                                color: 'var(--vscode-button-secondaryForeground)',
                                padding: '4px 12px',
                                cursor: 'pointer',
                                borderRadius: '4px'
                            }}>Decline</button>
                            <button onClick={handleEdit} style={{
                                border: '1px solid var(--vscode-button-border)',
                                background: 'var(--vscode-button-secondaryBackground)',
                                color: 'var(--vscode-button-secondaryForeground)',
                                padding: '4px 12px',
                                cursor: 'pointer',
                                borderRadius: '4px'
                            }}>Edit</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
