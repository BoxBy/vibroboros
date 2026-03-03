import { z } from 'zod';
import { ServiceLocator } from '../../di/ServiceLocator';

const inputSchema = z.object({
    url: z.string().url().describe("The URL to read content from."),
});

const outputSchema = z.object({
    content: z.string().describe("The content of the page, preferably in Markdown format."),
    contentType: z.string().optional(),
});

/**
 * Phase 9: Intelligent Context Compression - Content Negotiation
 * Forces 'Accept: text/markdown' to get compressed, LLM-friendly content.
 */
export function getReadURLToolDefinition() {
    return {
        name: 'read_url',
        description: {
            title: "Read URL Content",
            description: "Fetches the content of a URL. Uses content negotiation (Accept: text/markdown) to retrieve high-density, compressed context.",
            inputSchema,
            outputSchema,
        },
        handler: async ({ url }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            console.log(`[ReadURLTool] Fetching ${url} with Content Negotiation (text/markdown)...`);
            
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/markdown, text/html;q=0.9, */*;q=0.8',
                        'User-Agent': 'Viper/1.0.0 (AI Assistant; +https://github.com/BoxBy/Viper)'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
                }

                const contentType = response.headers.get('content-type') || '';
                const content = await response.text();

                // If we got HTML but wanted Markdown, we could potentially use a converter here
                // but if the server respects Content Negotiation, it should return markdown.
                // Popular services like r.jina.ai do this.
                
                return {
                    content,
                    contentType
                };
            } catch (error: any) {
                console.error(`[ReadURLTool] Error: ${error.message}`);
                throw error;
            }
        }
    };
}
