/**
 * Interface for Senior Risk Sentinel Service (Phase 10)
 * Detects high-risk behavioral patterns in proposed plans and code changes.
 */

export enum RiskLevel {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH",
    CRITICAL = "CRITICAL"
}

export interface RiskAssessment {
    level: RiskLevel;
    score: number; // 0.0 to 1.0
    reasons: string[];
    mitigations: string[];
}

export interface IRiskSentinelService {
    /**
     * Assesses the risk of a proposed plan or set of changes.
     */
    assessRisk(plan: string, changedFiles?: string[]): Promise<RiskAssessment>;

    /**
     * Checks for specific high-risk patterns (e.g., recursive deletion, secret exposure).
     */
    checkPatterns(content: string): RiskAssessment;
}
