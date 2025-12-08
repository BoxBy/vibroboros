import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    summary: string;
}, {
    summary: string;
}>;
declare const outputSchema: z.ZodObject<{
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
}, {
    message: string;
}>;
export declare function getTaskCompletionToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            summary: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            summary: string;
        }, {
            summary: string;
        }>;
        outputSchema: z.ZodObject<{
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            message: string;
        }, {
            message: string;
        }>;
    };
    handler: ({ summary }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
