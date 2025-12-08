import { z } from 'zod';

// Schema for the parameters of a tools/list request
export const ToolsListRequestSchema = z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal('tools/list'),
    params: z.object({}).optional(), // tools/list usually has no params
});

// Schema for the parameters of a tools/call request
export const ToolsCallRequestSchema = z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal('tools/call'),
    params: z.object({
        name: z.string(),
        arguments: z.record(z.any()).optional(),
    }),
});
