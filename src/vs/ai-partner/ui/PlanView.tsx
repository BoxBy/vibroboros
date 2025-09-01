import React from 'react';

export interface PlanStep {
    description: string;
    status: 'pending' | 'in-progress' | 'completed' | 'error';
}

interface PlanViewProps {
    plan: PlanStep[];
}

const getStatusIcon = (status: PlanStep['status']) => {
    switch (status) {
        case 'completed':
            return <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>✓</span>; // Checkmark
        case 'in-progress':
            return <span className="codicon codicon-sync codicon-spin"></span>; // Spinning sync icon
        case 'error':
            return <span style={{ color: 'var(--vscode-testing-iconFailed)' }}>✗</span>; // X mark
        case 'pending':
        default:
            return <span style={{ color: 'var(--vscode-descriptionForeground)' }}>●</span>; // Circle
    }
};

export const PlanView: React.FC<PlanViewProps> = ({ plan }) => {
    if (!plan || plan.length === 0) {
        return null;
    }

    return (
        <div className="plan-view-container" style={{ padding: '10px', borderBottom: '1px solid var(--vscode-panel-border)', marginBottom: '10px' }}>
            <h4 style={{ marginTop: 0, marginBottom: '8px' }}>Execution Plan:</h4>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {plan.map((step, index) => (
                    <li key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: step.status === 'completed' ? 0.7 : 1 }}>
                        <div style={{ width: '20px', textAlign: 'center' }}>{getStatusIcon(step.status)}</div>
                        <span style={{ textDecoration: step.status === 'completed' ? 'line-through' : 'none', color: step.status === 'error' ? 'var(--vscode-errorForeground)' : 'inherit' }}>
                            {step.description}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
