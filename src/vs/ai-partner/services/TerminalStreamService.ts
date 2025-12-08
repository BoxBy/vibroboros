import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as os from 'os';

export class TerminalStreamService {
    private proc: ChildProcessWithoutNullStreams | null = null;
    private onDataCallback: ((data: string) => void) | null = null;
    private onExitCallback: ((code: number | null) => void) | null = null;

    constructor(private name: string = 'Viper Agent') {}

    public run(command: string, onData?: (data: string) => void, onExit?: (code: number | null) => void) {
        this.dispose();
        this.onDataCallback = onData || null;
        this.onExitCallback = onExit || null;
        const isWin = os.platform() === 'win32';
        const shell = isWin ? 'powershell.exe' : '/bin/sh';
        const args = isWin ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
        this.proc = spawn(shell, args, { env: process.env });
        if (this.proc.stdout) {
            this.proc.stdout.on('data', (d: Buffer) => { try { this.onDataCallback && this.onDataCallback(d.toString()); } catch {} });
        }
        if (this.proc.stderr) {
            this.proc.stderr.on('data', (d: Buffer) => { try { this.onDataCallback && this.onDataCallback(d.toString()); } catch {} });
        }
        this.proc.on('close', (code: number | null) => { try { this.onExitCallback && this.onExitCallback(code); } catch {} });
    }

    public dispose() {
        try { this.proc && this.proc.kill(); } catch {}
        this.proc = null;
        this.onDataCallback = null;
        this.onExitCallback = null;
    }
}
