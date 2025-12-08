/**
 * A singleton service for logging internal diagnostic and debugging information
 * to a dedicated VS Code Output Channel, keeping the user-facing chat clean.
 */
export declare class DeveloperLogService {
    private static instance;
    private outputChannel;
    private constructor();
    /**
     * Gets the singleton instance of the service.
     */
    static getInstance(): DeveloperLogService;
    /**
     * Logs a message to the output channel.
     * @param message The message string to log.
     */
    log(message: string): void;
    /**
     * Reveals the output channel in the VS Code UI.
     */
    show(): void;
    /**
     * Disposes of the output channel when the extension is deactivated.
     */
    dispose(): void;
}
