import * as vscode from 'vscode';
import { z } from 'zod';

const inputSchema = z.object({
    url: z.string().url().describe('URL to open in the default system browser'),
});

const outputSchema = z.object({
    opened: z.boolean(),
});

export function getBrowserOpenToolDefinition() {
    return {
        name: 'BrowserOpenTool',
        description: {
            title: 'Open URL in Browser',
            description: 'Opens the provided URL in the default system browser.',
            inputSchema,
            outputSchema,
        },
        handler: async ({ url }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            try {
                const ok = await vscode.env.openExternal(vscode.Uri.parse(url));
                return { opened: !!ok };
            } catch {
                return { opened: false };
            }
        }
    };
}
