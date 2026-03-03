/**
 * Interface for Macro Service
 * Manages recording and execution of workflow macros
 */

export interface MacroStep {
    tool: string;
    arguments: any;
}

export interface Macro {
    name: string;
    description: string;
    steps: MacroStep[];
    timestamp?: string;
}

export interface IMacroService {
    /**
     * Save a new macro
     */
    saveMacro(macro: Macro): Promise<void>;

    /**
     * Get a macro by name
     */
    getMacro(name: string): Promise<Macro | undefined>;

    /**
     * List all saved macros
     */
    listMacros(): Promise<Macro[]>;

    /**
     * Delete a macro
     */
    deleteMacro(name: string): Promise<void>;

    /**
     * Start recording a macro
     */
    startRecording(name: string, description?: string): void;

    /**
     * Stop recording and save the macro
     */
    stopRecording(): Promise<Macro | undefined>;

    /**
     * Record a tool call step
     */
    recordStep(step: MacroStep): void;

    /**
     * Check if currently recording
     */
    isRecording(): boolean;

    /**
     * Get the name of the macro currently being recorded
     */
    getRecordingName(): string | undefined;
}
