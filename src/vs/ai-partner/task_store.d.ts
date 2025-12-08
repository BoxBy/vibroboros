import { ExtensionContext } from 'vscode';
import { Task, TaskStatus, TaskArtifact } from '@a2a-js/sdk';
/**
 * A persistent store for managing tasks using VSCode's globalState.
 */
export declare class TaskStore {
    private context;
    private static instance;
    private tasks;
    private constructor();
    static getInstance(context: ExtensionContext): TaskStore;
    private persistTasks;
    private loadTasks;
    addTask(task: Task): Promise<Task>;
    getTask(id: string): Task | undefined;
    updateTaskStatus(id: string, status: TaskStatus): Promise<Task | undefined>;
    updateTaskArtifacts(id: string, artifact: TaskArtifact, append: boolean): Promise<Task | undefined>;
    /**
     * Removes all completed, canceled, and errored tasks from the store.
     * @returns An array of the removed task IDs.
     */
    clearCompletedTasks(): Promise<string[]>;
    listTasks(): Task[];
}
