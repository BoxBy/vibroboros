/**
 * Manages interactions with the Language Model, including API key rotation.
 */
export class LlmService {
    private apiKeys: string[];
    private currentApiKeyIndex = 0;

    constructor(apiKeys: string[]) {
        this.apiKeys = apiKeys;
        if (this.apiKeys.length === 0) {
            console.warn("LLM Service: No API keys provided.");
        }
    }

    /**
     * Rotates to the next available API key.
     */
    private rotateApiKey(): void {
        if (this.apiKeys.length > 1) {
            this.currentApiKeyIndex = (this.currentApiKeyIndex + 1) % this.apiKeys.length;
            console.log("Rotated to next API key.");
        }
    }

    /**
     * Gets the current API key.
     */
    public getCurrentApiKey(): string | undefined {
        if (this.apiKeys.length === 0) {
            return undefined;
        }
        return this.apiKeys[this.currentApiKeyIndex];
    }

    /**
     * Simulates sending a completion request to the LLM.
     * @param prompt The prompt to send to the LLM.
     * @param model The name of the model to use for this request.
     * @returns A simulated response from the LLM.
     */
    public async getCompletion(prompt: string, model: string): Promise<string> {
        const apiKey = this.getCurrentApiKey();
        if (!apiKey) {
            return Promise.reject("No API key configured.");
        }

        console.log(`Sending completion request to model: ${model} with prompt: "${prompt.substring(0, 50)}..."`);

        // This is a placeholder for a real API call.
        // It simulates a quota error to test key rotation.
        if (prompt.includes("quota_error_test")) {
            console.error("Simulating QuotaLimit error.");
            this.rotateApiKey();
            return Promise.reject("Simulated QuotaLimit error. Please try again.");
        }

        return `This is a simulated response for the prompt: "${prompt.substring(0, 50)}..." using model ${model}`;
    }
}
