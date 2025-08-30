import * as vscode from 'vscode';

/**
 * NOTE: This is the legacy service. The primary service is now LLMService.ts in the services directory.
 * This service manages API keys and facilitates communication with the LLM.
 */
export class LlmService {
    private static instance: LlmService;
    private apiKeys: string[];
    private currentApiKeyIndex: number;

    private constructor() {
        this.apiKeys = vscode.workspace.getConfiguration('vibroboros.llm').get<string[]>('apiKeys', []);
        this.currentApiKeyIndex = 0;
    }

    public static getInstance(): LlmService {
        if (!LlmService.instance) {
            LlmService.instance = new LlmService();
        }
        return LlmService.instance;
    }

    public async getCompletion(prompt: string, model: string): Promise<string> {
        if (this.apiKeys.length === 0) {
            throw new Error('No API keys configured. Please check your settings.');
        }

        const apiKey = this.apiKeys[this.currentApiKeyIndex];
        const endpoint = vscode.workspace.getConfiguration('vibroboros.llm').get<string>('endpoint');

        try {
            const response = await fetch(endpoint || 'https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }]
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error('LLM request failed:', error);
            throw error;
        }
    }
}
