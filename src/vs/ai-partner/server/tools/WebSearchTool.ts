import { z } from 'zod';

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
            description: "Performs a web search using a search engine.",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ query }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            try {
                const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
                const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const html = await res.text();
                const items: { title: string; url: string; snippet?: string }[] = [];
                const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
                let m: RegExpExecArray | null;
                while ((m = regex.exec(html)) && items.length < 5) {
                    const urlDec = m[1].replace(/&amp;/g, '&');
                    const title = m[2].replace(/<[^>]+>/g, '');
                    const snippet = m[3]?.replace(/<[^>]+>/g, '').trim();
                    items.push({ title, url: urlDec, snippet });
                }
                return { results: items };
            } catch (error: any) {
                throw new Error(`Failed to perform web search. Error: ${error.message}`);
            }
        }
    };
}