import { z } from 'zod';
export declare const ToolsListRequestSchema: z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
    id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    method: z.ZodLiteral<"tools/list">;
    params: z.ZodOptional<z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>;
}, "strip", z.ZodTypeAny, {
    method: "tools/list";
    id: string | number;
    jsonrpc: "2.0";
    params?: {} | undefined;
}, {
    method: "tools/list";
    id: string | number;
    jsonrpc: "2.0";
    params?: {} | undefined;
}>;
export declare const ToolsCallRequestSchema: z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
    id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    method: z.ZodLiteral<"tools/call">;
    params: z.ZodObject<{
        toolName: z.ZodString;
        parameters: z.ZodRecord<z.ZodString, z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        toolName: string;
        parameters: Record<string, any>;
    }, {
        toolName: string;
        parameters: Record<string, any>;
    }>;
}, "strip", z.ZodTypeAny, {
    method: "tools/call";
    params: {
        toolName: string;
        parameters: Record<string, any>;
    };
    id: string | number;
    jsonrpc: "2.0";
}, {
    method: "tools/call";
    params: {
        toolName: string;
        parameters: Record<string, any>;
    };
    id: string | number;
    jsonrpc: "2.0";
}>;
