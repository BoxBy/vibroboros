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
        name: z.ZodString;
        arguments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        arguments?: Record<string, any> | undefined;
    }, {
        name: string;
        arguments?: Record<string, any> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    method: "tools/call";
    id: string | number;
    params: {
        name: string;
        arguments?: Record<string, any> | undefined;
    };
    jsonrpc: "2.0";
}, {
    method: "tools/call";
    id: string | number;
    params: {
        name: string;
        arguments?: Record<string, any> | undefined;
    };
    jsonrpc: "2.0";
}>;
