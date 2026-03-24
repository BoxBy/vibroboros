/**
 * EpisodicMemoryService — Phase 1/12: Hybrid Memory Strategy
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import * as path from 'path';
import * as fs from 'fs/promises';
import { IEpisodicMemoryService, MemoryEpisode, UncertaintyTrace } from '../di/interfaces/IEpisodicMemoryService';
import { IConfigService } from '../di/interfaces/IConfigService';
import { ServiceLocator } from '../di/ServiceLocator';
import { v4 as uuidv4 } from 'uuid';

/**
 * [Phase 1/12] Hybrid Memory Layer
 *
 * Storage Strategy (Inspired by: https://doi.org/10.5281/zenodo.18802214):
 *   - SUCCESS: Stores only status + result (slim, token-efficient)
 *   - ERROR:   Stores status + result + error log snippet (for Sentinel "Senior Intuition")
 *
 * Wisdom Extraction is delegated to ContextManagementAgent on session end.
 */
export class EpisodicMemoryService implements IEpisodicMemoryService {
    private readonly memoryDir: string;
    private readonly agentDir: string;
    private configService: IConfigService;

    constructor() {
        this.configService = ServiceLocator.getConfigService();
        const wsPath = this.configService.getWorkspacePath() || '';
        this.agentDir = path.join(wsPath, '.agent');
        this.memoryDir = path.join(wsPath, '.agent', 'memory', 'episodes');
    }

    private async ensureDir(): Promise<void> {
        await fs.mkdir(this.memoryDir, { recursive: true });
    }

    public async recordEpisode(data: Omit<MemoryEpisode, 'id' | 'timestamp' | 'uncertaintyTraces'>): Promise<string> {
        await this.ensureDir();
        const id = uuidv4();
        const timestamp = new Date().toISOString();

        // [Hybrid Memory] Detect error episodes by summary prefix.
        // BaseAgent produces '[ERROR] msg' (from catch block) or '[FAIL...] msg' (from LLM status).
        const isError = data.summary
            ? data.summary.startsWith('[ERROR]') || data.summary.startsWith('[FAIL')
            : false;
        const uncertaintyTraces = isError ? this.extractUncertainty(data.rawLog) : [];

        const episode: MemoryEpisode = {
            id,
            timestamp,
            uncertaintyTraces,
            ...data
        };

        const filePath = path.join(this.memoryDir, `${id}.json`);
        await fs.writeFile(filePath, JSON.stringify(episode, null, 2));
        
        // [Memory Retention] Trigger cleanup after writing new episode
        this.cleanupEpisodes().catch(() => {}); // Fire and forget

        // [Knowledge.md] Append slim entry: SUCCESS stores status/result, ERROR includes log snippet
        await this.appendToKnowledgeMd(data.agentName, data.summary || '', isError ? data.rawLog : undefined, timestamp);

        return id;
    }

    /**
     * [Hybrid Memory] Appends a slim experience record to .agent/knowledge.md.
     * - Success → summary only
     * - Error   → summary + truncated error log snippet (for Sentinel Senior Intuition)
     */
    private async appendToKnowledgeMd(agentName: string, summary: string, errorLog?: string, timestamp?: string): Promise<void> {
        try {
            await fs.mkdir(this.agentDir, { recursive: true });
            const knowledgePath = path.join(this.agentDir, 'knowledge.md');
            const ts = timestamp || new Date().toISOString();

            let entry = `\n### [${ts}] ${agentName}\n${summary || '(no summary)'}\n`;
            if (errorLog) {
                const snippet = errorLog.length > 400 ? errorLog.substring(0, 400) + '... [truncated]' : errorLog;
                entry += `\n**Error Log:**\n\`\`\`\n${snippet}\n\`\`\`\n`;
            }
            entry += `---\n`;

            await fs.appendFile(knowledgePath, entry, 'utf8');
        } catch {
            // Non-critical; never throw
        }
    }

    public async getRecentEpisodes(limit: number, agentName?: string): Promise<MemoryEpisode[]> {
        try {
            const files = await fs.readdir(this.memoryDir);
            const jsonFiles = files.filter((f: string) => f.endsWith('.json'));
            
            const episodePromises = jsonFiles.map(async (f: string) => {
                const content = await fs.readFile(path.join(this.memoryDir, f), 'utf-8');
                return JSON.parse(content) as MemoryEpisode;
            });

            let episodes = await Promise.all(episodePromises);
            
            if (agentName) {
                // Prioritize episodes from the requested agent
                episodes = episodes.filter(ep => ep.agentName === agentName);
            }

            return episodes
                .sort((a: MemoryEpisode, b: MemoryEpisode) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, limit);
        } catch (e) {
            return [];
        }
    }

    public extractUncertainty(rawLog: string | undefined): UncertaintyTrace[] {
        if (!rawLog) {
            return [];
        }
        const traces: UncertaintyTrace[] = [];
        const patterns = [
            { marker: "not sure", regex: /not sure (about|if|whether) (.*?)\./gi, score: 0.8 },
            { marker: "assuming", regex: /assuming (that )?(.*?)\./gi, score: 0.6 },
            { marker: "not verified", regex: /(not verified|unverified) (.*?)\./gi, score: 0.9 },
            { marker: "failed to", regex: /failed to (.*?)\./gi, score: 0.7 },
            { marker: "don't know", regex: /don't know (.*?)\./gi, score: 1.0 }
        ];

        for (const p of patterns) {
            let match;
            while ((match = p.regex.exec(rawLog)) !== null) {
                traces.push({
                    marker: p.marker,
                    content: match[0],
                    score: p.score
                });
            }
        }

        return traces;
    }

    private calculateJaccardSimilarity(textA: string, textB: string): number {
        if (!textA || !textB) {
            return 0;
        }
        const tokenize = (t: string) => [...new Set(t.toLowerCase().match(/\w+/g) || [])];
        const setA = new Set(tokenize(textA));
        const setB = new Set(tokenize(textB));
        if (setA.size === 0 && setB.size === 0) {
            return 0;
        }
        
        let intersection = 0;
        for (const word of setA) {
            if (setB.has(word)) intersection++;
        }
        const union = setA.size + setB.size - intersection;
        return union === 0 ? 0 : intersection / union;
    }

    private calculateAstOverlapScore(pastAsts: string[], currentAsts: string[]): number {
        if (!pastAsts || !currentAsts || pastAsts.length === 0 || currentAsts.length === 0) {
            return 0;
        }
        const setA = new Set(pastAsts);
        const setB = new Set(currentAsts);
        
        let intersection = 0;
        for (const ast of setB) {
            if (setA.has(ast)) {
                intersection++;
            }
        }
        const union = setA.size + setB.size - intersection;
        return union === 0 ? 0 : intersection / union;
    }

    public async getBlendedContext(limit: number, agentName?: string, currentUserInput?: string, currentAstSignatures?: string[]): Promise<string> {
        // Fetch up to 100 recent episodes for scoring pool
        let episodes = await this.getRecentEpisodes(100, agentName);
        if (episodes.length === 0) {
            return "";
        }

        // Apply scoring if filtering params exist
        if (currentUserInput || (currentAstSignatures && currentAstSignatures.length > 0)) {
            const scoredEpisodes = episodes.map(ep => {
                const epText = `${ep.userInput || ''} ${ep.summary || ''}`;
                const lexicalScore = currentUserInput ? this.calculateJaccardSimilarity(currentUserInput, epText) : 0;
                
                const astScore = (currentAstSignatures && ep.affectedAstSignatures)
                    ? this.calculateAstOverlapScore(ep.affectedAstSignatures, currentAstSignatures)
                    : 0;
                
                // Weighting: slightly favor structural match if both are available
                let totalScore = 0;
                if (currentUserInput && currentAstSignatures && currentAstSignatures.length > 0) {
                    totalScore = (lexicalScore * 0.4) + (astScore * 0.6);
                } else if (currentUserInput) {
                    totalScore = lexicalScore;
                } else {
                    totalScore = astScore;
                }

                return { episode: ep, score: totalScore };
            });

            const threshold = 0.05; // Low threshold just to clear complete noise
            const relevant = scoredEpisodes
                .filter(se => se.score > threshold)
                .sort((a, b) => b.score - a.score);
            
            episodes = relevant.slice(0, limit).map(se => se.episode);
            
            if (episodes.length === 0) {
                return ""; // No relevant past experience
            }
        } else {
            episodes = episodes.slice(0, limit);
        }

        let context = "\n\n<SeniorIntuition>\n";
        context += `The following are highly relevant historical experiences for ${agentName || 'the system'} based on your current task context. Use these to avoid past mistakes.\n\n`;

        for (const ep of episodes) {
            context += `[Episode] Agent: ${ep.agentName}\n`;
            if (ep.userInput) {
                context += `Task: ${this.truncateLog(ep.userInput, 100)}\n`;
            }
            if (ep.summary) {
                context += `Outcome/Lessons: ${ep.summary}\n`;
            }
            if (ep.affectedAstSignatures && ep.affectedAstSignatures.length > 0) {
                context += `Affected ASTs: ${ep.affectedAstSignatures.join(', ')}\n`;
            }
            
            if (ep.rawLog && ep.uncertaintyTraces && ep.uncertaintyTraces.length > 0) {
                context += `Triggering Error/Log:\n${this.truncateLog(ep.rawLog, 300)}\n`;
            }

            if (ep.uncertaintyTraces && ep.uncertaintyTraces.length > 0) {
                context += `Risk Signals:\n`;
                for (const ut of ep.uncertaintyTraces) {
                    context += `- [Risk: ${ut.score}] ${ut.content}\n`;
                }
            }
            context += "---\n";
        }

        context += "</SeniorIntuition>";
        return context;
    }

    private truncateLog(log: string, maxChars: number): string {
        if (log.length <= maxChars) {
            return log;
        }
        return log.substring(0, maxChars) + "... [truncated]";
    }

    /**
     * [Memory Retention] Maintains only the latest 100 episodes to prevent infinite growth.
     */
    private async cleanupEpisodes(): Promise<void> {
        try {
            const files = await fs.readdir(this.memoryDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            if (jsonFiles.length <= 100) {
                return;
            }

            // Get stats for all files to sort by mtime
            const fileStats = await Promise.all(
                jsonFiles.map(async (f) => {
                    const filePath = path.join(this.memoryDir, f);
                    const stat = await fs.stat(filePath);
                    return { name: f, time: stat.mtimeMs };
                })
            );

            // Sort oldest first (ascending time)
            fileStats.sort((a, b) => a.time - b.time);

            // Delete oldest files until we have 100 left
            const toDelete = fileStats.slice(0, fileStats.length - 100);
            for (const file of toDelete) {
                await fs.unlink(path.join(this.memoryDir, file.name));
            }
            console.log(`[EpisodicMemoryService] Cleaned up ${toDelete.length} old memory episodes.`);
        } catch (err) {
            // Never throw from cleanup
        }
    }
}

