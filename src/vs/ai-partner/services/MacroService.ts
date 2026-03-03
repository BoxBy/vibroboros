import * as vscode from 'vscode';
import * as path from 'path';
import { IMacroService, Macro, MacroStep } from '../di/interfaces/IMacroService';
import { IConfigService } from '../di/interfaces/IConfigService';

/**
 * Macro Service Implementation
 * Persists macros in .agent/macros.json
 */
export class MacroService implements IMacroService {
    constructor(private configService: IConfigService) {}

    private async getMacroPath(): Promise<string | undefined> {
        const root = this.configService.getWorkspacePath();
        if (!root) { return undefined; }
        return path.join(root, '.agent', 'macros.json');
    }

    public async saveMacro(macro: Macro): Promise<void> {
        const filePath = await this.getMacroPath();
        if (!filePath) { return; }

        const macros = await this.listMacros();
        const existingIndex = macros.findIndex(m => m.name === macro.name);
        
        const macroToSave = {
            ...macro,
            timestamp: new Date().toISOString()
        };

        if (existingIndex >= 0) {
            macros[existingIndex] = macroToSave;
        } else {
            macros.push(macroToSave);
        }

        const uri = vscode.Uri.file(filePath);
        const dir = vscode.Uri.file(path.dirname(filePath));

        try {
            await vscode.workspace.fs.createDirectory(dir);
        } catch {}

        const content = Buffer.from(JSON.stringify(macros, null, 2), 'utf8');
        await vscode.workspace.fs.writeFile(uri, content);
    }

    public async getMacro(name: string): Promise<Macro | undefined> {
        const macros = await this.listMacros();
        return macros.find(m => m.name === name);
    }

    public async listMacros(): Promise<Macro[]> {
        const filePath = await this.getMacroPath();
        if (!filePath) { return []; }

        try {
            const uri = vscode.Uri.file(filePath);
            const buf = await vscode.workspace.fs.readFile(uri);
            return JSON.parse(Buffer.from(buf).toString('utf8'));
        } catch {
            return [];
        }
    }

    private recordingName?: string;
    private recordingDescription?: string;
    private currentSteps: MacroStep[] = [];

    public startRecording(name: string, description: string = ''): void {
        this.recordingName = name;
        this.recordingDescription = description;
        this.currentSteps = [];
        console.log(`[MacroService] Started recording macro: ${name}`);
    }

    public async stopRecording(): Promise<Macro | undefined> {
        if (!this.recordingName) { return undefined; }

        const macro: Macro = {
            name: this.recordingName,
            description: this.recordingDescription || '',
            steps: [...this.currentSteps]
        };

        if (macro.steps.length > 0) {
            await this.saveMacro(macro);
        }

        const name = this.recordingName;
        this.recordingName = undefined;
        this.recordingDescription = undefined;
        this.currentSteps = [];

        console.log(`[MacroService] Stopped recording macro: ${name}. Saved ${macro.steps.length} steps.`);
        return macro;
    }

    public recordStep(step: MacroStep): void {
        if (!this.isRecording()) { return; }
        
        // Only record successful tool sequences (filtering happens here if needed)
        // For now, record all called in this session
        this.currentSteps.push(step);
        console.log(`[MacroService] Recorded step for ${this.recordingName}: ${step.tool}`);
    }

    public isRecording(): boolean {
        return !!this.recordingName;
    }

    public getRecordingName(): string | undefined {
        return this.recordingName;
    }

    public async deleteMacro(name: string): Promise<void> {
        const filePath = await this.getMacroPath();
        if (!filePath) { return; }

        let macros = await this.listMacros();
        const initialLength = macros.length;
        macros = macros.filter(m => m.name !== name);

        if (macros.length === initialLength) { return; }

        const uri = vscode.Uri.file(filePath);
        const content = Buffer.from(JSON.stringify(macros, null, 2), 'utf8');
        await vscode.workspace.fs.writeFile(uri, content);
    }
}
