import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    query: z.ZodString;
}, "strip", z.ZodTypeAny, {
    query: string;
}, {
    query: string;
}>;
declare const outputSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        url: z.ZodString;
        snippet: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        url: string;
        snippet?: string | undefined;
    }, {
        title: string;
        url: string;
        snippet?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    results: {
        title: string;
        url: string;
        snippet?: string | undefined;
    }[];
}, {
    results: {
        title: string;
        url: string;
        snippet?: string | undefined;
    }[];
}>;
export declare function getWebSearchToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            query: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            query: string;
        }, {
            query: string;
        }>;
        outputSchema: z.ZodObject<{
            results: z.ZodArray<z.ZodObject<{
                title: z.ZodString;
                url: z.ZodString;
                snippet: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                title: string;
                url: string;
                snippet?: string | undefined;
            }, {
                title: string;
                url: string;
                snippet?: string | undefined;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            results: {
                title: string;
                url: string;
                snippet?: string | undefined;
            }[];
        }, {
            results: {
                title: string;
                url: string;
                snippet?: string | undefined;
            }[];
        }>;
    };
    handler: ({ query }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
