import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    args: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    args: string[];
}, {
    args: string[];
}>;
declare const outputSchema: z.ZodObject<{
    output: z.ZodString;
}, "strip", z.ZodTypeAny, {
    output: string;
}, {
    output: string;
}>;
export declare function getGitAutomationToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            args: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            args: string[];
        }, {
            args: string[];
        }>;
        outputSchema: z.ZodObject<{
            output: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            output: string;
        }, {
            output: string;
        }>;
    };
    handler: ({ args }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
