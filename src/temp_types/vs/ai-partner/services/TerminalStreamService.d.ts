export declare class TerminalStreamService {
    private name;
    private proc;
    private onDataCallback;
    private onExitCallback;
    constructor(name?: string);
    run(command: string, onData?: (data: string) => void, onExit?: (code: number | null) => void): void;
    dispose(): void;
}
