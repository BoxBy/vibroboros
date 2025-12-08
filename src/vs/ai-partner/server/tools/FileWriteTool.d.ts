import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    filePath: z.ZodString;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
    filePath: string;
}, {
    content: string;
    filePath: string;
}>;
declare const outputSchema: z.ZodObject<{
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
}, {
    message: string;
}>;
export declare function getFileWriteToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            filePath: z.ZodString;
            content: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            content: string;
            filePath: string;
        }, {
            content: string;
            filePath: string;
        }>;
        outputSchema: z.ZodObject<{
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            message: string;
        }, {
            message: string;
        }>;
    };
    handler: ({ filePath, content }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
