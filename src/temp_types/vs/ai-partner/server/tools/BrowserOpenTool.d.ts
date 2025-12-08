import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    url: z.ZodString;
}, "strip", z.ZodTypeAny, {
    url: string;
}, {
    url: string;
}>;
declare const outputSchema: z.ZodObject<{
    opened: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    opened: boolean;
}, {
    opened: boolean;
}>;
export declare function getBrowserOpenToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            url: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            url: string;
        }, {
            url: string;
        }>;
        outputSchema: z.ZodObject<{
            opened: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            opened: boolean;
        }, {
            opened: boolean;
        }>;
    };
    handler: ({ url }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
