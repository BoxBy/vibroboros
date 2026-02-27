/**
 * BM25 Search Tool (Stub)
 * TODO: Implement actual BM25 search
 */
import { z } from 'zod';

const inputSchema = z.object({
    query: z.string().describe("The search query"),
    topK: z.number().optional().describe("Number of results to return"),
});

const outputSchema = z.object({
    results: z.array(z.object({
        path: z.string(),
        score: z.number(),
    })),
});

export function getBM25SearchToolDefinition() {
    return {
        name: 'bm25_search',
        description: {
            title: "BM25 Search",
            description: "Search code using BM25 keyword matching",
            inputSchema,
            outputSchema,
        },
        handler: async ({ query, topK = 10 }: z.infer<typeof inputSchema>) => {
            // TODO: Implement actual BM25 search
            return { results: [] };
        },
    };
}
