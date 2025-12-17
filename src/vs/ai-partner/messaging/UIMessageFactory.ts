import * as path from 'path';

export interface FileCardPayload {
    senderName: string;
    filePath: string;
    title?: string; // Optional, derived from filePath if missing
    suggestionType: 'create-file' | 'edit-file';
    timestamp?: string;
    lintSummary?: string;
}

export class UIMessageFactory {
    
    /**
     * Creates a message payload for displaying a File Card (Create/Update).
     */
    public static createFileCard(senderName: string, filePath: string, isUpdate: boolean, lintSummary?: string): { command: string, payload: FileCardPayload } {
        return {
            command: 'createFileCard',
            payload: {
                senderName,
                filePath,
                title: path.basename(filePath),
                suggestionType: isUpdate ? 'edit-file' : 'create-file', // Maps "update" action to "edit-file" type for UI
                timestamp: new Date().toISOString(),
                lintSummary
            }
        };
    }

    /**
     * Creates a standard text response message.
     */
    public static createResponse(senderName: string, text: string): { command: string, payload: { text: string, senderName: string } } {
        return {
            command: 'response',
            payload: {
                text,
                senderName
            }
        };
    }

    /**
     * Creates a progress log message.
     */
    public static createProgressLog(text: string): { command: string, payload: { text: string } } {
        return {
            command: 'progressLog',
            payload: {
                text
            }
        };
    }
}
