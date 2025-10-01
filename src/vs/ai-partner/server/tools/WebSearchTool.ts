import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';

declare function google_web_search(args: { query: string }): Promise<any>;

export function registerWebSearchTool(server: McpServer) {
    server.registerTool(
        'WebSearchTool',
        {
            title: "Web Search",
            description: "Performs a web search using a search engine.",
            inputSchema: z.object({
                query: z.string().describe("The search query to execute."),
            }),
            outputSchema: z.object({
                results: z.string().describe("The search results."),
            }),
        },
        async ({ query }) => {
            try {
                const searchResults = await google_web_search({ query });
                const resultsText = JSON.stringify(searchResults, null, 2);
                return { results: resultsText };
            } catch (error: any) {
                throw new Error(`Failed to perform web search. Error: ${error.message}`);
            }
        }
    );
}