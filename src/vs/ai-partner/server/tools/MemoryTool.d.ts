import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    fact: z.ZodString;
}, "strip", z.ZodTypeAny, {
    fact: string;
}, {
    fact: string;
}>;
declare const outputSchema: z.ZodObject<{
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
}, {
    message: string;
}>;
export declare function getMemoryToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            fact: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            fact: string;
        }, {
            fact: string;
        }>;
        outputSchema: z.ZodObject<{
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            message: string;
        }, {
            message: string;
        }>;
    };
    handler: ({ fact }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
