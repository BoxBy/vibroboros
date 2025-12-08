import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    dirPath: z.ZodString;
    recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    dirPath: string;
    recursive: boolean;
}, {
    dirPath: string;
    recursive?: boolean | undefined;
}>;
declare const outputSchema: z.ZodObject<{
    created: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    created: boolean;
}, {
    created: boolean;
}>;
export declare function getMkdirToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            dirPath: z.ZodString;
            recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        }, "strip", z.ZodTypeAny, {
            dirPath: string;
            recursive: boolean;
        }, {
            dirPath: string;
            recursive?: boolean | undefined;
        }>;
        outputSchema: z.ZodObject<{
            created: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            created: boolean;
        }, {
            created: boolean;
        }>;
    };
    handler: ({ dirPath, recursive }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
