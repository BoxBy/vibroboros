import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    command: z.ZodString;
}, "strip", z.ZodTypeAny, {
    command: string;
}, {
    command: string;
}>;
declare const outputSchema: z.ZodObject<{
    output: z.ZodString;
}, "strip", z.ZodTypeAny, {
    output: string;
}, {
    output: string;
}>;
export declare function getTerminalExecutionToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            command: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            command: string;
        }, {
            command: string;
        }>;
        outputSchema: z.ZodObject<{
            output: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            output: string;
        }, {
            output: string;
        }>;
    };
    handler: ({ command }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
