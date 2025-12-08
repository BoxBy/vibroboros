import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    targetPath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    targetPath: string;
}, {
    targetPath: string;
}>;
declare const outputSchema: z.ZodObject<{
    exists: z.ZodBoolean;
    isFile: z.ZodOptional<z.ZodBoolean>;
    isDir: z.ZodOptional<z.ZodBoolean>;
    size: z.ZodOptional<z.ZodNumber>;
    mtimeMs: z.ZodOptional<z.ZodNumber>;
    ctimeMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    exists: boolean;
    size?: number | undefined;
    mtimeMs?: number | undefined;
    isFile?: boolean | undefined;
    isDir?: boolean | undefined;
    ctimeMs?: number | undefined;
}, {
    exists: boolean;
    size?: number | undefined;
    mtimeMs?: number | undefined;
    isFile?: boolean | undefined;
    isDir?: boolean | undefined;
    ctimeMs?: number | undefined;
}>;
export declare function getStatToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            targetPath: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            targetPath: string;
        }, {
            targetPath: string;
        }>;
        outputSchema: z.ZodObject<{
            exists: z.ZodBoolean;
            isFile: z.ZodOptional<z.ZodBoolean>;
            isDir: z.ZodOptional<z.ZodBoolean>;
            size: z.ZodOptional<z.ZodNumber>;
            mtimeMs: z.ZodOptional<z.ZodNumber>;
            ctimeMs: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            exists: boolean;
            size?: number | undefined;
            mtimeMs?: number | undefined;
            isFile?: boolean | undefined;
            isDir?: boolean | undefined;
            ctimeMs?: number | undefined;
        }, {
            exists: boolean;
            size?: number | undefined;
            mtimeMs?: number | undefined;
            isFile?: boolean | undefined;
            isDir?: boolean | undefined;
            ctimeMs?: number | undefined;
        }>;
    };
    handler: ({ targetPath }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
