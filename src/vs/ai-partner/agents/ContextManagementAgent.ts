import * as vscode from 'vscode';
import * as path from 'path';
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { AgentCard, Message, Artifact } from "@a2a-js/sdk";
import { A2AClient } from "@a2a-js/sdk/client";
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '../config_service';
import { publishProgressLog } from './utils/sdkProgressHelper';

export class ContextManagementAgent implements AgentExecutor {
    private codeAnalysisClient: A2AClient;
    private configService: ConfigService;

    constructor(private card: AgentCard) {
        this.configService = ConfigService.getInstance();
        const agentBaseUrl = `http://localhost:${this.configService.getA2AServerPort()}`;
        this.codeAnalysisClient = new A2AClient({ url: `${agentBaseUrl}/agent/codeanalysis` } as any);
    }

    async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        try {
            // Robust parts extraction across possible wrappers
            const ctxAny = requestContext as any;
            const msgObj = ctxAny?.message || ctxAny?.request?.message || ctxAny?.request || ctxAny;
            const parts = msgObj?.parts || ctxAny?.parts || ctxAny?.request?.parts;
            const query = Array.isArray(parts) ? (parts.find((p: any) => p && p.kind === 'text' && typeof p.text === 'string')?.text || '').trim() : '';
            if (!query) { throw new Error('No text part provided for ContextManagementAgent.'); }
            publishProgressLog(eventBus, `Gathering context for query: ${query}`, requestContext);

            // 1. Gather basic context
            const activeEditor = vscode.window.activeTextEditor;
            const openFiles = vscode.workspace.textDocuments.map(doc => doc.uri.fsPath);
            const activeFilePath = activeEditor ? activeEditor.document.uri.fsPath : 'N/A';
            const folderOverviewContent = await this.getFolderOverview(activeEditor);

            let basicContext: any = {
                originalQuery: query,
                activeFilePath,
                uiLanguage: vscode.env.language,
                contentPreview: activeEditor ? activeEditor.document.getText().substring(0, 2000) : 'N/A',
                openFiles,
                folderOverview: folderOverviewContent,
            };

            // 2. Search for symbols in the query
            const symbolMatch = query.match(/\b([A-Za-z_][A-Za-z0-9_]{4,})\b/); // Match longer symbols
            const symbolName = symbolMatch ? symbolMatch[1] : null;

            // 3. If symbol found, call CodeAnalysisAgent
            if (symbolName) {
                publishProgressLog(eventBus, `Found potential symbol '${symbolName}', searching codebase.`, requestContext);
                try {
                    const searchTask = await this.codeAnalysisClient.sendMessage({
                        message: {
                            content: {
                                type: 'search',
                                symbolName
                            }
                        }
                    });
                    (basicContext as any).codebaseSearchResults = (searchTask as any).artifacts;
                    publishProgressLog(eventBus, `Codebase search completed.`, requestContext);
                } catch(e: any) {
                    publishProgressLog(eventBus, `Codebase search failed: ${e.message}`, requestContext);
                }
            }

            // 4. Create final artifact
            const artifact: Artifact = {
                kind: 'artifact',
                artifactId: uuidv4(),
                mimeType: 'application/json',
                data: basicContext,
                description: 'Combined context for the user query'
            };
            (eventBus as any).publish(artifact as any);

            const finalMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: 'Context gathered successfully.' }],
                contextId: requestContext.contextId,
            };
            (eventBus as any).publish(finalMessage as any);

        } catch (e: any) {
            const errorMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: `An error occurred while gathering context: ${e.message}` }],
                contextId: requestContext.contextId,
            };
            (eventBus as any).publish(errorMessage as any);
        } finally {
            try {
                if (typeof (eventBus as any).finished === 'function') {
                    (eventBus as any).finished();
                }
            } catch {}
        }
    }

    async cancelTask(): Promise<void> {
        // no-op
    }

    private async getFolderOverview(activeEditor: vscode.TextEditor | undefined): Promise<string> {
        if (!activeEditor) {
            return 'N/A';
        }
        const dirPath = path.dirname(activeEditor.document.uri.fsPath);
        const overviewPath = path.join(dirPath, '_folder_overview.md');
        try {
            const overviewUri = vscode.Uri.file(overviewPath);
            const overviewContentBytes = await vscode.workspace.fs.readFile(overviewUri);
            return Buffer.from(overviewContentBytes).toString('utf-8');
        } catch (error) {
            return 'No folder overview file found for the current directory.';
        }
    }
}