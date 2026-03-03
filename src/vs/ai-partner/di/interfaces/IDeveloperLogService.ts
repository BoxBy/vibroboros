import * as vscode from 'vscode';

/**
 * Interface for the Developer Log Service.
 * Provides methods for logging internal diagnostic and debugging information.
 */
export interface IDeveloperLogService extends vscode.Disposable {
    /**
     * Logs a message to the developer output channel.
     * @param message The message to log.
     */
    log(message: string): void;

    /**
     * Reveals the developer output channel in the VS Code UI.
     */
    show(): void;

    /**
     * Disposes of the service and its resources.
     */
    dispose(): void;
}
