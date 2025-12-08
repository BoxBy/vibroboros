import * as vscode from 'vscode';

/**
 * A singleton service for logging internal diagnostic and debugging information
 * to a dedicated VS Code Output Channel, keeping the user-facing chat clean.
 */
export class DeveloperLogService {
    private static instance: DeveloperLogService;
    private outputChannel: vscode.OutputChannel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('AI Partner (Developer)');
    }

    /**
     * Gets the singleton instance of the service.
     */
    public static getInstance(): DeveloperLogService {
        if (!DeveloperLogService.instance) {
            DeveloperLogService.instance = new DeveloperLogService();
        }
        return DeveloperLogService.instance;
    }

    /**
     * Logs a message to the output channel.
     * @param message The message string to log.
     */
    public log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    /**
     * Reveals the output channel in the VS Code UI.
     */
    public show(): void {
        this.outputChannel.show();
    }

    /**
     * Disposes of the output channel when the extension is deactivated.
     */
    public dispose(): void {
        this.outputChannel.dispose();
    }
}
