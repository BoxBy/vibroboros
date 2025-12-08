import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    types: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    types?: string[] | undefined;
}, {
    types?: string[] | undefined;
}>;
declare const outputSchema: z.ZodObject<{
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
}, {
    message: string;
}>;
export declare function getGitignoreToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            types: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            types?: string[] | undefined;
        }, {
            types?: string[] | undefined;
        }>;
        outputSchema: z.ZodObject<{
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            message: string;
        }, {
            message: string;
        }>;
    };
    handler: ({ types }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
