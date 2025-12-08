import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    query: z.ZodString;
}, "strip", z.ZodTypeAny, {
    query: string;
}, {
    query: string;
}>;
declare const outputSchema: z.ZodObject<{
    results: z.ZodString;
}, "strip", z.ZodTypeAny, {
    results: string;
}, {
    results: string;
}>;
export declare function getWebSearchToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            query: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            query: string;
        }, {
            query: string;
        }>;
        outputSchema: z.ZodObject<{
            results: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            results: string;
        }, {
            results: string;
        }>;
    };
    handler: ({ query }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
