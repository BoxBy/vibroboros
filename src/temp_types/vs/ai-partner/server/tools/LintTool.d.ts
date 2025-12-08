import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    paths: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    fix: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    format: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    paths: string[];
    fix: boolean;
    format: string;
}, {
    paths?: string[] | undefined;
    fix?: boolean | undefined;
    format?: string | undefined;
}>;
declare const outputSchema: z.ZodObject<{
    errorCount: z.ZodNumber;
    warningCount: z.ZodNumber;
    results: z.ZodAny;
    output: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    errorCount: number;
    warningCount: number;
    results?: any;
    output?: string | undefined;
}, {
    errorCount: number;
    warningCount: number;
    results?: any;
    output?: string | undefined;
}>;
export declare function getLintToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            paths: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            fix: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
            format: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            paths: string[];
            fix: boolean;
            format: string;
        }, {
            paths?: string[] | undefined;
            fix?: boolean | undefined;
            format?: string | undefined;
        }>;
        outputSchema: z.ZodObject<{
            errorCount: z.ZodNumber;
            warningCount: z.ZodNumber;
            results: z.ZodAny;
            output: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            errorCount: number;
            warningCount: number;
            results?: any;
            output?: string | undefined;
        }, {
            errorCount: number;
            warningCount: number;
            results?: any;
            output?: string | undefined;
        }>;
    };
    handler: ({ paths, fix, format }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
