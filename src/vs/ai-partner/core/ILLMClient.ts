export interface ILLMClient {
    generateText(prompt: string, options?: { temperature?: number }): Promise<string>;
}
