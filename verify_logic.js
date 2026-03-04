function mapScoreToLevel(score) {
    if (score >= 1.0) return 'CRITICAL';
    if (score >= 0.8) return 'HIGH';
    if (score >= 0.5) return 'MEDIUM';
    return 'LOW';
}

function assessRisk(content) {
    let score = 0;
    const reasons = [];
    const mitigations = [];

    // Pattern 1: Recursive Deletion
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

    // Pattern 3: Secret Exposure
    if (/(process\.env\.[A-Z_]+_KEY|apiKey\s*[:=]|password\s*[:=]|secret\s*[:=])/gi.test(content)) {
        reasons.push("Potential hardcoded secret or environment variable leakage.");
        mitigations.push("Use SecretStorageService and avoid logging sensitive variables.");
        score += 0.4;
    }

    // Pattern 5: Destructive Git/Process commands
    if (/(git\s+push\s+.*--force|truncate|chmod\s+777|format\s+[A-Z]:)/gi.test(content)) {
        reasons.push("Extremely dangerous or destructive command detected.");
        mitigations.push("Verify alternative non-destructive commands (e.g., force-with-lease).");
        score += 0.6;
    }

    return {
        level: mapScoreToLevel(score),
        score,
        reasons,
        mitigations
    };
}

const cases = [
    { name: "Safe command", content: "ls -la", expectedLevel: "LOW" },
    { name: "Recursive delete", content: "rm -rf /data", expectedLevel: "MEDIUM" }, // 0.5 -> MEDIUM
    { name: "Rimraf delete", content: "rimraf dist", expectedLevel: "MEDIUM" }, // 0.5 -> MEDIUM
    { name: "Git force push", content: "git push origin master --force", expectedLevel: "MEDIUM" }, // 0.6 -> MEDIUM
    { name: "Secret exposure (apiKey)", content: "const apiKey = 'sk-123';", expectedLevel: "LOW" }, // 0.4 -> LOW
    { name: "Secret exposure (secret)", content: "const secret = 'my-secret';", expectedLevel: "LOW" }, // 0.4 -> LOW
    { name: "Recursive + Git Force", content: "rm -rf .git; git push --force", expectedLevel: "CRITICAL" }, // 0.5 + 0.6 = 1.1 -> CRITICAL
    { name: "Bulk delete + Secret", content: "files.forEach(f => fs.unlink(f)); const password = '123';", expectedLevel: "MEDIUM" } // 0.3 + 0.4 = 0.7 -> MEDIUM
];

console.log("=== RiskSentinel Logic Verification ===");
for (const c of cases) {
    const assessment = assessRisk(c.content);
    const passed = assessment.level === c.expectedLevel;
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${c.name}: Expected ${c.expectedLevel}, Got ${assessment.level} (Score: ${assessment.score.toFixed(1)})`);
}
