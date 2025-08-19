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

    /**
     * Adds a complete Task object to the store. Used for initial task creation from a stream.
     * @param task The complete task object to add.
     */
    public async addTask(task: Task): Promise<Task> {
        this.tasks.set(task.id, task);
        await this.persistTasks();
        return task;
    }

    public async createTask(task: Omit<Task, 'id' | 'status' | 'history' | 'artifacts'>): Promise<Task> {
        const newId = this.generateId();
        const newTask: Task = {
            ...task,
            id: newId,
            status: {
                state: 'submitted',
                timestamp: new Date().toISOString(),
            },
            history: [],
            artifacts: [],
        };
        this.tasks.set(newId, newTask);
        await this.persistTasks();
        return newTask;
    }

    public getTask(id: string): Task | undefined {
        return this.tasks.get(id);
    }

    public async updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined> {
        const task = this.tasks.get(id);
        if (task) {
            const updatedTask = { ...task, ...updates };
            this.tasks.set(id, updatedTask);
            await this.persistTasks();
            return updatedTask;
        }
        return undefined;
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

    /**
     * Updates a task's artifacts based on a TaskArtifactUpdateEvent.
     * @param id The ID of the task to update.
     * @param artifact The artifact data.
     * @param append Whether to append the artifact parts or replace the artifact.
     */
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

    public listTasks(): Task[] {
        return Array.from(this.tasks.values());
    }

    private generateId(): string {
        return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}
