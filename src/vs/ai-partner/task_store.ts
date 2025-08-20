import { ExtensionContext } from 'vscode';
import { Task, TaskStatus, TaskArtifact } from './core_data_structures';

const TASK_STORE_KEY = 'ai-partner.tasks';

/**
 * A persistent store for managing tasks using VSCode's globalState.
 */
export class TaskStore {
    private static instance: TaskStore;
    private tasks: Map<string, Task> = new Map();

    private constructor(private context: ExtensionContext) {
        this.loadTasks();
    }

    public static getInstance(context: ExtensionContext): TaskStore {
        if (!TaskStore.instance) {
            TaskStore.instance = new TaskStore(context);
        }
        return TaskStore.instance;
    }

    private async persistTasks(): Promise<void> {
        const tasksArray = Array.from(this.tasks.entries());
        await this.context.globalState.update(TASK_STORE_KEY, tasksArray);
    }

    private loadTasks(): void {
        const tasksArray = this.context.globalState.get<[string, Task][]>(TASK_STORE_KEY, []);
        this.tasks = new Map(tasksArray);
    }

    public async addTask(task: Task): Promise<Task> {
        this.tasks.set(task.id, task);
        await this.persistTasks();
        return task;
    }

    public getTask(id: string): Task | undefined {
        return this.tasks.get(id);
    }

    public async updateTaskStatus(id: string, status: TaskStatus): Promise<Task | undefined> {
        const task = this.tasks.get(id);
        if (task) {
            task.status = status;
            this.tasks.set(id, task);
            await this.persistTasks();
            return task;
        }
        return undefined;
    }

    public async updateTaskArtifacts(id: string, artifact: TaskArtifact, append: boolean): Promise<Task | undefined> {
        const task = this.tasks.get(id);
        if (task) {
            const existingArtifactIndex = task.artifacts.findIndex(a => a.artifactId === artifact.artifactId);
            if (existingArtifactIndex > -1) {
                if (append) {
                    task.artifacts[existingArtifactIndex].parts.push(...artifact.parts);
                } else {
                    task.artifacts[existingArtifactIndex] = artifact;
                }
            } else {
                task.artifacts.push(artifact);
            }
            this.tasks.set(id, task);
            await this.persistTasks();
            return task;
        }
        return undefined;
    }

    /**
     * Removes all completed, canceled, and errored tasks from the store.
     * @returns An array of the removed task IDs.
     */
    public async clearCompletedTasks(): Promise<string[]> {
        const removedTaskIds: string[] = [];
        for (const [taskId, task] of this.tasks.entries()) {
            if (['completed', 'canceled', 'error'].includes(task.status.state)) {
                removedTaskIds.push(taskId);
                this.tasks.delete(taskId);
            }
        }
        if (removedTaskIds.length > 0) {
            await this.persistTasks();
        }
        return removedTaskIds;
    }

    public listTasks(): Task[] {
        return Array.from(this.tasks.values());
    }
}
