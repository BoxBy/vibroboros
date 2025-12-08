import { z } from 'zod';
declare const outputSchema: z.ZodObject<{
    entries: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        path: z.ZodString;
        type: z.ZodEnum<["file", "dir"]>;
        size: z.ZodOptional<z.ZodNumber>;
        mtimeMs: z.ZodOptional<z.ZodNumber>;
        rootIndex: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: "file" | "dir";
        name: string;
        path: string;
        size?: number | undefined;
        mtimeMs?: number | undefined;
        rootIndex?: number | undefined;
    }, {
        type: "file" | "dir";
        name: string;
        path: string;
        size?: number | undefined;
        mtimeMs?: number | undefined;
        rootIndex?: number | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    entries: {
        type: "file" | "dir";
        name: string;
        path: string;
        size?: number | undefined;
        mtimeMs?: number | undefined;
        rootIndex?: number | undefined;
    }[];
}, {
    entries: {
        type: "file" | "dir";
        name: string;
        path: string;
        size?: number | undefined;
        mtimeMs?: number | undefined;
        rootIndex?: number | undefined;
    }[];
}>;
export declare function getListDirToolDefinition(): {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: z.ZodObject<{
            dirPath: z.ZodString;
            recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
            pattern: z.ZodOptional<z.ZodString>;
            ignore: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            sortBy: z.ZodDefault<z.ZodOptional<z.ZodEnum<["name", "size", "mtime"]>>>;
            order: z.ZodDefault<z.ZodOptional<z.ZodEnum<["asc", "desc"]>>>;
            start: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            roots: z.ZodDefault<z.ZodOptional<z.ZodEnum<["primary", "all"]>>>;
            followSymlinks: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        }, "strip", z.ZodTypeAny, {
            roots: "primary" | "all";
            dirPath: string;
            recursive: boolean;
            sortBy: "name" | "size" | "mtime";
            order: "asc" | "desc";
            start: number;
            limit: number;
            followSymlinks: boolean;
            pattern?: string | undefined;
            ignore?: string[] | undefined;
        }, {
            dirPath: string;
            roots?: "primary" | "all" | undefined;
            recursive?: boolean | undefined;
            pattern?: string | undefined;
            ignore?: string[] | undefined;
            sortBy?: "name" | "size" | "mtime" | undefined;
            order?: "asc" | "desc" | undefined;
            start?: number | undefined;
            limit?: number | undefined;
            followSymlinks?: boolean | undefined;
        }>;
        outputSchema: z.ZodObject<{
            entries: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                path: z.ZodString;
                type: z.ZodEnum<["file", "dir"]>;
                size: z.ZodOptional<z.ZodNumber>;
                mtimeMs: z.ZodOptional<z.ZodNumber>;
                rootIndex: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                type: "file" | "dir";
                name: string;
                path: string;
                size?: number | undefined;
                mtimeMs?: number | undefined;
                rootIndex?: number | undefined;
            }, {
                type: "file" | "dir";
                name: string;
                path: string;
                size?: number | undefined;
                mtimeMs?: number | undefined;
                rootIndex?: number | undefined;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            entries: {
                type: "file" | "dir";
                name: string;
                path: string;
                size?: number | undefined;
                mtimeMs?: number | undefined;
                rootIndex?: number | undefined;
            }[];
        }, {
            entries: {
                type: "file" | "dir";
                name: string;
                path: string;
                size?: number | undefined;
                mtimeMs?: number | undefined;
                rootIndex?: number | undefined;
            }[];
        }>;
    };
    handler: (input: any) => Promise<z.infer<typeof outputSchema>>;
};
export {};
