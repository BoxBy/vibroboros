import { z } from 'zod';
declare const inputSchema: z.ZodObject<{
    command: z.ZodString;
    timeoutMs: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    command: string;
    timeoutMs: number;
}, {
    command: string;
    timeoutMs?: number | undefined;
}>;
declare const outputSchema: z.ZodObject<{
    stdout: z.ZodString;
    stderr: z.ZodString;
    exitCode: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    stdout: string;
    stderr: string;
    exitCode: number;
}, {
    stdout: string;
    stderr: string;
    exitCode: number;
}>;
export declare function getTerminalExecutionToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            command: z.ZodString;
            timeoutMs: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        }, "strip", z.ZodTypeAny, {
            command: string;
            timeoutMs: number;
        }, {
            command: string;
            timeoutMs?: number | undefined;
        }>;
        outputSchema: z.ZodObject<{
            stdout: z.ZodString;
            stderr: z.ZodString;
            exitCode: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            stdout: string;
            stderr: string;
            exitCode: number;
        }, {
            stdout: string;
            stderr: string;
            exitCode: number;
        }>;
    };
    handler: ({ command, timeoutMs }: z.infer<typeof inputSchema>) => Promise<z.infer<typeof outputSchema>>;
};
export {};
