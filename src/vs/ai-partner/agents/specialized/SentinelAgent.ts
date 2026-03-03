/**
 * SentinelAgent — Phase 10: Senior Intuition Risk Sentinel (Semantic Pattern Trigger)
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Concept inspired by:
 * - dev-sentinel: https://github.com/elbanic/dev-sentinel (see NOTICE file)
 * - Hybrid Memory: https://doi.org/10.5281/zenodo.18802214
 *
 * This implementation is written independently. No source code has been copied.
 *
 * Purpose: Given a plan or A2A payload, detect architectural risks (race conditions,
 * circular state updates, etc.) using semantic LLM reasoning — NOT keyword matching.
 * Enhanced with project-specific historical failure patterns from .agent/wisdom.json.
 */
import { AgentCard } from '@a2a-js/sdk';
import { RequestContext, ExecutionEventBus } from '@a2a-js/sdk/server';
import { Message } from '@a2a-js/sdk';
import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from '../core/BaseAgent';
import { RiskLevel } from '../../di/interfaces/IRiskSentinelService';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * SentinelAgent (Phase 10)
 * Performs semantic architectural risk assessment on plans before execution.
 * Uses a zero-keyword approach — relies entirely on LLM pattern recognition.
 */
export class SentinelAgent extends BaseAgent {
    protected outputFormat: 'json' | 'text' = 'json';

    constructor(card: AgentCard) {
        super(card);
    }

    protected async getSystemPrompt(_userInput: string, _ctx: RequestContext): Promise<string> {
        // [P10 Hybrid Memory] Inject past failure patterns from knowledge.md and wisdom.json
        // so Sentinel can reason with actual project-specific history ("Senior Intuition").
        // Source: https://github.com/elbanic/dev-sentinel (AGPL-3.0 compatible, reimplemented)
        let historicalContext = '';
        try {
            const wsPath = this.configService.getWorkspacePath() || '';

            // Try wisdom.json first (distilled patterns, most signal-dense)
            let wisdomLoaded = false;
            try {
                const wisdomPath = path.join(wsPath, '.agent', 'wisdom.json');
                const wisdomRaw = await fs.readFile(wisdomPath, 'utf-8');
                const wisdom = JSON.parse(wisdomRaw);
                if (wisdom?.patterns?.length > 0) {
                    historicalContext += '\n\n## Historical Failure Patterns (from project wisdom)\n';
                    historicalContext += 'These patterns have occurred in this project before. Give them elevated weight:\n';
                    for (const p of wisdom.patterns.slice(0, 5)) {
                        historicalContext += `- ${typeof p === 'string' ? p : JSON.stringify(p)}\n`;
                    }
                    wisdomLoaded = true;
                }
            } catch { /* No wisdom.json yet */ }

            // Fallback: read last 5 error lines from knowledge.md for recent signals
            if (!wisdomLoaded) {
                try {
                    const knowledgePath = path.join(wsPath, '.agent', 'knowledge.md');
                    const content = await fs.readFile(knowledgePath, 'utf-8');
                    const errorLines = content.split('\n')
                        .filter((l: string) => l.includes('[ERROR]') || l.includes('[FAIL'))
                        .slice(-5);
                    if (errorLines.length > 0) {
                        historicalContext += '\n\n## Recent Failures in This Project\n';
                        historicalContext += errorLines.join('\n') + '\n';
                    }
                } catch { /* No knowledge.md yet */ }
            }
        } catch { /* Ignore injection errors */ }

        return `You are a Senior Software Architect and Risk Sentinel.
Your sole responsibility is to analyze a proposed plan of action for architectural risks.
${historicalContext}
## Your Role:
- Reason about HIGH-LEVEL patterns that junior engineers often miss.
- You do NOT search for keywords like "lock" or "mutex". Instead, you identify STRUCTURAL patterns.
- You MUST provide a "Risk Reasoning" block before any verdict.

## Senior Failure Patterns to detect (semantic, not keyword-based):
1. **Race Condition Pattern**: Multiple async agents writing to the same resource without coordination.
2. **Circular State Update**: Updating shared state inside a loop that reads the same state.
3. **Cascading Failure**: A single point of failure that causes a chain of unrecoverable errors.
4. **Resource Starvation**: Parallel tasks exhausting a shared resource (e.g., token limits, API rate).
5. **Over-delegation**: Decomposing too finely such that coordination overhead exceeds task cost.

## Output Format (strict JSON):
{
  "thinking": "<Your detailed Risk Reasoning — MANDATORY before verdict>",
  "riskAssessment": {
    "level": "<LOW|MEDIUM|HIGH|CRITICAL>",
    "score": <0.0 to 1.0>,
    "reasons": ["<reason 1>", "..."],
    "mitigations": ["<mitigation 1>", "..."]
  }
}

If the plan is safe: level=LOW, score=0.0-0.2. Always include reasons even when safe.`;
    }

    protected async getTools(_userInput: string, _ctx: RequestContext): Promise<any[]> {
        return []; // Sentinel is a pure reasoning agent — no tools needed.
    }

    public async cancelTask(): Promise<void> {}

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, _correlationId?: string): Promise<void> {
        let riskData: any = {
            level: RiskLevel.LOW,
            score: 0.0,
            reasons: ['No structured output received.'],
            mitigations: []
        };

        try {
            const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/) || result.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result;
            const parsed = JSON.parse(jsonString);
            // Structured output is under parsed.riskAssessment per the system prompt schema
            if (parsed?.riskAssessment) {
                riskData = parsed.riskAssessment;
            }
        } catch {
            // Non-JSON result; use default safe response above
        }

        const payloadData = {
            toolName: 'SentinelAgent',
            command: 'risk-assessment',
            payload: riskData
        };

        const responseMessage: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [
                { kind: 'text', text: result },
                { kind: 'data', mimeType: 'application/vnd.a2a+json', data: payloadData }
            ],
            contextId: (requestContext as any)?.contextId
        } as any;
        eventBus.publish(responseMessage);
    }
}
