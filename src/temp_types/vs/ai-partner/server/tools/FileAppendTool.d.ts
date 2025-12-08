import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    filePath: z.ZodString;
    content: z.ZodString;
    createIfMissing: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    filePath: string;
    content: string;
    createIfMissing: boolean;
}, {
    filePath: string;
    content: string;
    createIfMissing?: boolean | undefined;
}>;
declare const outputSchema: z.ZodObject<{
    bytesAppended: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    bytesAppended: number;
}, {
    bytesAppended: number;
}>;
export declare function getFileAppendToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            filePath: z.ZodString;
            content: z.ZodString;
            createIfMissing: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        }, "strip", z.ZodTypeAny, {
            filePath: string;
            content: string;
            createIfMissing: boolean;
        }, {
            filePath: string;
            content: string;
            createIfMissing?: boolean | undefined;
        }>;
        outputSchema: z.ZodObject<{
            bytesAppended: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            bytesAppended: number;
        }, {
            bytesAppended: number;
        }>;
    };
    handler: ({ filePath, content, createIfMissing }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
