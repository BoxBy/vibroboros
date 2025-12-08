import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    filePath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    filePath: string;
}, {
    filePath: string;
}>;
declare const outputSchema: z.ZodObject<{
    deleted: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    deleted: boolean;
}, {
    deleted: boolean;
}>;
export declare function getFileDeleteToolDefinition(): {
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
            deleted: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            deleted: boolean;
        }, {
            deleted: boolean;
        }>;
    };
    handler: ({ filePath }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
