/**
 * LightweightSearchService
 *
 * Implements a hybrid search pipeline for Phase 3:
 * 1. BM25 candidate extraction from workspace files.
 * 2. Early exit for low-confidence queries.
 * 3. Local embedding reranking using @xenova/transformers.
 * 4. Returns top-K relevant file paths.
 *
 * License: MIT (self-authored; BM25 adapted from academic TFIDF principles)
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { IgnoreService } from './IgnoreService';

interface SearchResult {
    filePath: string;
    score: number;
    snippet?: string;
}

interface BM25Document {
    filePath: string;
    tokens: string[];
}

export class LightweightSearchService {
    private static instance: LightweightSearchService;
    private embeddingPipeline: any = null;
    private isInitialized = false;

    private get workspaceRoot(): string {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    public static getInstance(): LightweightSearchService {
        if (!LightweightSearchService.instance) {
            LightweightSearchService.instance = new LightweightSearchService();
        }
        return LightweightSearchService.instance;
    }

    // ---------- BM25 Logic ----------

    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1);
    }

    private bm25Score(
        queryTokens: string[],
        doc: BM25Document,
        avgDocLen: number,
        idfMap: Map<string, number>,
        k1 = 1.5,
        b = 0.75
    ): number {
        const docLen = doc.tokens.length;
        const freqMap = new Map<string, number>();
        for (const t of doc.tokens) freqMap.set(t, (freqMap.get(t) || 0) + 1);

        let score = 0;
        for (const q of queryTokens) {
            const tf = freqMap.get(q) || 0;
            const idf = idfMap.get(q) || 0;
            score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDocLen))));
        }
        return score;
    }

    private buildIdf(docs: BM25Document[], queryTokens: string[]): Map<string, number> {
        const N = docs.length;
        const idfMap = new Map<string, number>();
        for (const qt of queryTokens) {
            const df = docs.filter(d => d.tokens.includes(qt)).length;
            idfMap.set(qt, Math.log((N - df + 0.5) / (df + 0.5) + 1));
        }
        return idfMap;
    }

    // ---------- Main Search Pipeline ----------

    public async search(query: string, topK = 5): Promise<SearchResult[]> {
        const root = this.workspaceRoot;
        if (!root) return [];

        // 1. Gather candidate files (lightweight - only text files)
        const ignoreService = IgnoreService.getInstance();
        await ignoreService.initialize();
        const excludes = ignoreService.getExcludesGlob();

        const uris = await vscode.workspace.findFiles(
            '**/*.{ts,tsx,js,jsx,py,java,go,cs,md}',
            excludes
        );

        const EARLY_EXIT_THRESHOLD = 3; // If query tokens too few, return empty
        const queryTokens = this.tokenize(query);
        if (queryTokens.length < EARLY_EXIT_THRESHOLD - 2) {
            // Early exit for trivially short queries
            console.log('[LightweightSearch] Early exit: query too short/vague.');
            return [];
        }

        // 2. BM25 pass — read files and score
        const documents: BM25Document[] = [];
        const fileContents = new Map<string, string>();

        await Promise.all(uris.map(async (uri) => {
            try {
                const content = await fs.readFile(uri.fsPath, 'utf-8');
                const tokens = this.tokenize(content);
                documents.push({ filePath: uri.fsPath, tokens });
                fileContents.set(uri.fsPath, content);
            } catch { /* skip unreadable files */ }
        }));

        if (documents.length === 0) return [];

        const avgLen = documents.reduce((s, d) => s + d.tokens.length, 0) / documents.length;
        const idfMap = this.buildIdf(documents, queryTokens);

        const bm25Results: SearchResult[] = documents
            .map(doc => ({
                filePath: doc.filePath,
                score: this.bm25Score(queryTokens, doc, avgLen, idfMap),
            }))
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20); // candidate pool for reranking

        if (bm25Results.length === 0) return [];

        // 3. Embedding Reranking (optional, uses @xenova/transformers if available)
        let finalResults = bm25Results;
        try {
            finalResults = await this.rerankWithEmbeddings(query, bm25Results, fileContents, topK);
        } catch (e) {
            console.warn('[LightweightSearch] Embedding reranking skipped:', e);
            finalResults = bm25Results.slice(0, topK);
        }

        // 4. Attach snippet
        return finalResults.slice(0, topK).map(r => {
            const content = fileContents.get(r.filePath) || '';
            const lines = content.split('\n');
            const snippetLines: string[] = [];
            for (const qt of queryTokens) {
                const idx = lines.findIndex(l => l.toLowerCase().includes(qt));
                if (idx !== -1) {
                    snippetLines.push(lines[idx].trim());
                    if (snippetLines.length >= 2) break;
                }
            }
            return { ...r, snippet: snippetLines.join(' | ') };
        });
    }

    private async rerankWithEmbeddings(
        query: string,
        candidates: SearchResult[],
        fileContents: Map<string, string>,
        topK: number
    ): Promise<SearchResult[]> {
        // Lazy-load pipeline
        if (!this.embeddingPipeline) {
            const { pipeline } = require('@xenova/transformers');
            // Use lightweight MiniLM model
            this.embeddingPipeline = await pipeline(
                'feature-extraction',
                'Xenova/all-MiniLM-L6-v2',
                { quantized: true }
            );
        }

        // Embed the query
        const queryEmbed = await this.embeddingPipeline(query, { pooling: 'mean', normalize: true });
        const qVec: number[] = Array.from(queryEmbed.data);

        // Embed each candidate (use first 500 chars as representative snippet)
        const scoredResults = await Promise.all(
            candidates.map(async (r) => {
                const content = fileContents.get(r.filePath) || '';
                const snippet = content.substring(0, 500);
                const embed = await this.embeddingPipeline(snippet, { pooling: 'mean', normalize: true });
                const dVec: number[] = Array.from(embed.data);
                const cosine = this.cosineSimilarity(qVec, dVec);
                return { ...r, score: cosine };
            })
        );

        return scoredResults.sort((a, b) => b.score - a.score);
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
    }
}
