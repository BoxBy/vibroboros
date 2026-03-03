import { v4 as uuidv4 } from 'uuid';
import * as vscode from 'vscode';

export interface ToolApprovalRequest {
    approvalId: string;
    toolName: string;
    arguments: any;
    contextId: string;
    agentName: string;
    riskAssessment?: {
        level: string;
        score: number;
        reasons: string[];
        mitigations: string[];
    };
}

export class ReviewService {
    private static instance: ReviewService;
    private pendingApprovals = new Map<string, (approved: boolean) => void>();
    private _onDidRequestReview = new vscode.EventEmitter<ToolApprovalRequest>();
    public readonly onDidRequestReview = this._onDidRequestReview.event;

    private constructor() {}

    public static getInstance(): ReviewService {
        if (!ReviewService.instance) {
            ReviewService.instance = new ReviewService();
        }
        return ReviewService.instance;
    }

    /**
     * Request user approval for a tool execution.
     * Returns a promise that resolves with the user's decision.
     */
    public async requestApproval(request: Omit<ToolApprovalRequest, 'approvalId'>): Promise<boolean> {
        const approvalId = uuidv4();
        const fullRequest: ToolApprovalRequest = { ...request, approvalId };

        return new Promise<boolean>((resolve) => {
            this.pendingApprovals.set(approvalId, resolve);
            this._onDidRequestReview.fire(fullRequest);
        });
    }

    /**
     * Resolve a pending approval request.
     */
    public resolveApproval(approvalId: string, approved: boolean): void {
        const resolver = this.pendingApprovals.get(approvalId);
        if (resolver) {
            resolver(approved);
            this.pendingApprovals.delete(approvalId);
        }
    }
}
