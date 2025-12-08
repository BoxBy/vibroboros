import React from 'react';
export interface PlanStep {
    description: string;
    status: 'pending' | 'in-progress' | 'completed' | 'error';
}
interface PlanViewProps {
    plan: PlanStep[];
    isAutonomousMode: boolean;
}
export declare const PlanView: React.FC<PlanViewProps>;
export {};
