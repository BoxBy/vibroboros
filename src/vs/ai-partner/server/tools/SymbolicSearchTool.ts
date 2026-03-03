import { z } from 'zod';
import { SymbolicSearchService } from '../../services/SymbolicSearchService';
import { ServiceRegistry } from '../../services/ServiceRegistry';

const inputSchema = z.object({
    query: z.string().describe("The symbol name or partial name to search for."),
    filePath: z.string().optional().describe("Optional relative path to restrict the search to a specific file."),
});

const outputSchema = z.object({
    symbols: z.array(z.object({
        name: z.string(),
        kind: z.string(),
        filePath: z.string(),
        range: z.object({
            start: z.object({ line: z.number(), character: z.number() }),
            end: z.object({ line: z.number(), character: z.number() }),
        }),
    })).describe("List of found symbols with their locations."),
});

export function getSymbolicSearchToolDefinition() {
    return {
        name: 'symbolic_search',
        description: {
            title: "Symbolic Search",
            description: "Search for code symbols (functions, classes, methods) using tree-sitter. Provides precise locations across the workspace or within a file.",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ query, filePath }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            const registry = ServiceRegistry.getInstance();
            const service = registry.get<SymbolicSearchService>('SymbolicSearchService');
            
            if (!service) {
                throw new Error('SymbolicSearchService not found');
            }

            const symbols = await service.findSymbol(query, { filePath });
            
            return {
                symbols: symbols.map((s: any) => ({
                    name: s.name,
                    kind: s.kind.toString(), // Simplified kind
                    filePath: s.location.uri.fsPath,
                    range: {
                        start: { line: s.location.range.start.line, character: s.location.range.start.character },
                        end: { line: s.location.range.end.line, character: s.location.range.end.character },
                    }
                }))
            };
        }
    };
}
