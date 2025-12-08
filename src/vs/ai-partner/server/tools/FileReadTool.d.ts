import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    filePath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    filePath: string;
}, {
    filePath: string;
}>;
declare const outputSchema: z.ZodObject<{
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
}, {
    content: string;
}>;
export declare function getFileReadToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            filePath: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            filePath: string;
        }, {
            filePath: string;
        }>;
        outputSchema: z.ZodObject<{
            content: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            content: string;
        }, {
            content: string;
        }>;
    };
    handler: ({ filePath }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
