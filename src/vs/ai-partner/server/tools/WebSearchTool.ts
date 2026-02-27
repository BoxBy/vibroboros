import { z } from 'zod';
import { ConfigService } from '../../config_service';
import { ServiceLocator } from '../../di/ServiceLocator';

const inputSchema = z.object({
    query: z.string().describe("The search query to execute."),
});

const outputSchema = z.object({
    results: z.array(z.object({ title: z.string(), url: z.string(), snippet: z.string().optional() })),
});

export function getWebSearchToolDefinition() {
    return {
        name: 'web_search',
        description: {
            title: "Web Search",
            description: "Performs a web search using Tavily Search API. Use this for general research (RPD).",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ query }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            try {
                const configService = ServiceLocator.getConfigService();
                const apiKey = await configService.getTavilyApiKey();

                console.log(`[WebSearchTool] Executing Tavily search for query: "${query}"`);
                if (!apiKey) {
                    console.error(`[WebSearchTool] Missing Tavily API Key.`);
                    throw new Error("Tavily API Key is not configured in Settings. Use 'Viper: Set Tavily API Key' command.");
                }

                const response = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        api_key: apiKey,
                        query: query,
                        search_depth: "basic",
                        include_answer: true,
                        max_results: 10
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[WebSearchTool] Tavily API Error: ${response.status} - ${errorText}`);
                    throw new Error(`Tavily API returned error ${response.status}: ${errorText}`);
                }

                const data: any = await response.json();
                const items: { title: string; url: string; snippet?: string }[] = (data.results || []).map((item: any) => ({
                    title: item.title,
                    url: item.url,
                    snippet: item.content
                }));

                console.log(`[WebSearchTool] Tavily Search returned ${items.length} results.`);
                return { results: items };
            } catch (error: any) {
                throw new Error(`Failed to perform web search. Error: ${error.message}`);
            }
        }
    };
}