import { RequestContext } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { Message } from "@a2a-js/sdk";

/**
 * Common utility functions for extracting and handling A2A message parts
 */

export interface ParsedRequestData {
    parts: any[];
    textPart?: any;
    dataPart?: any;
    text: string;
    filePath?: string;
    contextFiles?: string[];
    correlation?: any;
    query?: string;
}

/**
 * Robustly extracts parts from RequestContext across various SDK wrappers
 */
export function extractRequestParts(requestContext: RequestContext): ParsedRequestData {
    const anyCtx: any = requestContext as any;
    const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;

    let parts = Array.isArray(incoming?.parts)
        ? incoming.parts
        : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);

    // Find text part
    const textPart = parts.find((p: any) =>
        p && (p.kind === 'text' || p.type === 'text') &&
        typeof (p.text ?? p.content) === 'string' &&
        String(p.text ?? p.content).trim().length > 0
    );

    // Find data part with A2A JSON
    const dataPart = parts.find((p: any) =>
        p && p.kind === 'data' &&
        ((typeof p.mimeType === 'string' && p.mimeType.toLowerCase().includes('application/vnd.a2a+json')) || !p.mimeType)
    );

    const text = textPart ? String((textPart as any).text ?? (textPart as any).content).trim() : '';
    const data = dataPart?.data || {};

    return {
        parts,
        textPart,
        dataPart,
        text,
        filePath: data.filePath,
        contextFiles: Array.isArray(data.contextFiles) ? data.contextFiles : undefined,
        correlation: data.correlation,
        query: data.query || text
    };
}

/**
 * Attempts to extract file path from various sources including task data and inline text
 */
export function extractFilePath(requestContext: RequestContext, parsed?: ParsedRequestData): string | undefined {
    if (!parsed) {
        parsed = extractRequestParts(requestContext);
    }

    if (parsed.filePath) {
        return parsed.filePath;
    }

    // Try to extract from task data (legacy)
    const anyCtx: any = requestContext as any;
    const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;

    try {
        const taskFilePath = incoming?.task?.data?.filePath || incoming?.data?.filePath;
        if (taskFilePath) {
            return taskFilePath;
        }
    } catch {}

    // Try to parse from text
    if (parsed.text) {
        const m = parsed.text.match(/([A-Za-z]:\\[^\s"']+\.[A-Za-z0-9]+|[^\s"']+\.[A-Za-z0-9]+)/);
        if (m && m[1]) {
            return m[1].trim();
        }
    }

    return undefined;
}

/**
 * Creates a standard SDK-compliant success response message
 */
export function createSuccessResponse(params: {
    text: string;
    data?: any;
    contextId?: string;
}): Message {
    const parts: any[] = [
        { kind: 'text', text: params.text }
    ];

    if (params.data) {
        parts.push({
            kind: 'data',
            mimeType: 'application/vnd.a2a+json',
            data: params.data
        } as any);
    }

    return {
        kind: 'message',
        messageId: uuidv4(),
        role: 'agent',
        parts,
        contextId: params.contextId
    };
}

/**
 * Creates a standard SDK-compliant error response message
 */
export function createErrorResponse(params: {
    error: string;
    contextId?: string;
    correlation?: any;
}): Message {
    return {
        kind: 'message',
        messageId: uuidv4(),
        role: 'agent',
        parts: [
            { kind: 'text', text: `An error occurred: ${params.error}` },
            {
                kind: 'data',
                mimeType: 'application/vnd.a2a+json',
                data: {
                    success: false,
                    error: params.error,
                    correlation: params.correlation
                }
            } as any
        ],
        contextId: params.contextId
    };
}

/**
 * Extracts correlation from various sources with MAF-style alias support
 */
export function extractCorrelation(requestContext: RequestContext, parsed?: ParsedRequestData): any | undefined {
    if (!parsed) {
        parsed = extractRequestParts(requestContext);
    }

    if (parsed.correlation) {
        return parsed.correlation;
    }

    // Try legacy task data
    const anyCtx: any = requestContext as any;
    const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;

    try {
        return incoming?.task?.data?.correlation || incoming?.data?.correlation;
    } catch {}

    return undefined;
}

