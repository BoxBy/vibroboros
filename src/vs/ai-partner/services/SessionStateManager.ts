import * as vscode from 'vscode';
import { ISessionStateManager, SessionGoal, SessionMilestone } from '../di/interfaces/ISessionStateManager';

export class SessionStateManager implements ISessionStateManager {
    private static readonly STATE_PREFIX = 'aiPartnerSessionState_';
    private currentSessionId: string | undefined;
    private goal: SessionGoal | undefined;
    private milestones: SessionMilestone[] = [];

    constructor(private memento: vscode.Memento) {}

    public setGoal(goal: SessionGoal): void {
        this.goal = goal;
    }

    public getGoal(): SessionGoal | undefined {
        return this.goal;
    }

    public addMilestone(milestone: SessionMilestone): void {
        const index = this.milestones.findIndex(m => m.id === milestone.id);
        if (index >= 0) {
            this.milestones[index] = milestone;
        } else {
            this.milestones.push(milestone);
        }
    }

    public getMilestones(): SessionMilestone[] {
        return this.milestones;
    }

    public reachMilestone(id: string): void {
        const milestone = this.milestones.find(m => m.id === id);
        if (milestone) {
            milestone.status = 'reached';
            milestone.timestamp = new Date().toISOString();
        }
    }

    public reset(sessionId: string): void {
        this.currentSessionId = sessionId;
        this.goal = undefined;
        this.milestones = [];
    }

    public async save(): Promise<void> {
        if (!this.currentSessionId) {
            return;
        }
        const state = {
            goal: this.goal,
            milestones: this.milestones
        };
        await this.memento.update(`${SessionStateManager.STATE_PREFIX}${this.currentSessionId}`, state);
    }

    public async load(sessionId: string): Promise<void> {
        this.currentSessionId = sessionId;
        const data = this.memento.get<{ goal: SessionGoal; milestones: SessionMilestone[] }>(
            `${SessionStateManager.STATE_PREFIX}${sessionId}`
        );
        if (data) {
            this.goal = data.goal;
            this.milestones = data.milestones || [];
        } else {
            this.goal = undefined;
            this.milestones = [];
        }
    }
}
