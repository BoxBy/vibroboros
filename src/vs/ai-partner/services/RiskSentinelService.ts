import { IRiskSentinelService, RiskAssessment, RiskLevel } from '../di/interfaces/IRiskSentinelService';

export class RiskSentinelService implements IRiskSentinelService {
    
    public async assessRisk(plan: string, changedFiles?: string[]): Promise<RiskAssessment> {
        const structuralRisk = this.checkPatterns(plan);
        
        let multiplier = 1.0;
        if (changedFiles && changedFiles.length > 5) {
            multiplier = 1.2; // Multi-file impact
        }
        if (changedFiles?.some(f => f.includes('.env') || f.includes('config'))) {
            multiplier *= 1.5; // Config impact
        }

        structuralRisk.score = Math.min(1.0, structuralRisk.score * multiplier);
        structuralRisk.level = this.mapScoreToLevel(structuralRisk.score);
        
        return structuralRisk;
    }

    public checkPatterns(content: string): RiskAssessment {
        const reasons: string[] = [];
        const mitigations: string[] = [];
        let score = 0.1; // Base risk

        // Pattern 1: Recursive Deletion (Structural, not keyword only)
        // Matches commands like rm -rf, deleteRecursive, fs.rmSync with recursive: true
        if (/(rm\s+-rf|deleteRecursive|fs\.rm(Sync)?\(.*recursive:\s*true\s*\)|rimraf)/gi.test(content)) {
            reasons.push("Potential recursive deletion detected.");
            mitigations.push("Ensure a backup exists or verify the target path strictly.");
            score += 0.5;
        }

        // Pattern 2: Bulk File Mutation
        if (/(forEach|map).*?(fs\.unlink|fs\.writeFile|delete)/gi.test(content)) {
            reasons.push("Bulk file operation loop detected.");
            mitigations.push("Review loop bounds and error handling for partial failures.");
            score += 0.3;
        }

        // Pattern 3: Secret Exposure / API Keys
        if (/(process\.env\.[A-Z_]+_KEY|apiKey\s*[:=]|password\s*[:=]|secret\s*[:=])/gi.test(content)) {
            reasons.push("Potential hardcoded secret or environment variable leakage.");
            mitigations.push("Use SecretStorageService and avoid logging sensitive variables.");
            score += 0.4;
        }

        // Pattern 4: Network Access in sensitive areas
        if (/(fetch|axios|https\.get).*?(auth|login|token)/gi.test(content)) {
            reasons.push("Network request involving credentials detected.");
            mitigations.push("Ensure HTTPS and proper token masking.");
            score += 0.2;
        }

        // Pattern 5: Destructive Git/Process commands
        if (/(git\s+push\s+.*--force|truncate|chmod\s+777|format\s+[A-Z]:)/gi.test(content)) {
            reasons.push("Extremely dangerous or destructive command detected.");
            mitigations.push("Verify alternative non-destructive commands (e.g., force-with-lease).");
            score += 0.6;
        }

        return {
            level: this.mapScoreToLevel(score),
            score,
            reasons,
            mitigations
        };
    }

    private mapScoreToLevel(score: number): RiskLevel {
        if (score >= 0.8) {
            return RiskLevel.CRITICAL;
        }
        if (score >= 0.5) {
            return RiskLevel.HIGH;
        }
        if (score >= 0.3) {
            return RiskLevel.MEDIUM;
        }
        return RiskLevel.LOW;
    }
}
