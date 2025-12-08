import { Server } from '@modelcontextprotocol/sdk/server';
import { z, ZodSchema } from 'zod';
export interface ToolDefinition<TInput extends ZodSchema, TOutput extends ZodSchema> {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: TInput;
        outputSchema: TOutput;
    };
    handler: (input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
}
export declare function createMCPServer(): Server;
