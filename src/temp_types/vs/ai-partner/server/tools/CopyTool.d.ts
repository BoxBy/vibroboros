import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    overwrite: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
    overwrite: boolean;
}, {
    from: string;
    to: string;
    overwrite?: boolean | undefined;
}>;
declare const outputSchema: z.ZodObject<{
    copied: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    copied: boolean;
}, {
    copied: boolean;
}>;
export declare function getCopyToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
            overwrite: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        }, "strip", z.ZodTypeAny, {
            from: string;
            to: string;
            overwrite: boolean;
        }, {
            from: string;
            to: string;
            overwrite?: boolean | undefined;
        }>;
        outputSchema: z.ZodObject<{
            copied: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            copied: boolean;
        }, {
            copied: boolean;
        }>;
    };
    handler: ({ from, to, overwrite }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
