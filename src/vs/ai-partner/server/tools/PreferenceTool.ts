import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

const storeInputSchema = z.object({
    suggestionType: z.string().describe("The type of suggestion (e.g., 'refactoring', 'documentation', 'testing')"),
    accepted: z.boolean().describe("Whether the user accepted (true) or dismissed (false) the suggestion"),
});

const getInputSchema = z.object({
    suggestionType: z.string().describe("The type of suggestion to get preference for"),
});

const outputSchema = z.object({
    message: z.string().describe("A confirmation or result message"),
});

type UserPreference = 'positive' | 'negative' | 'neutral';

interface PreferenceData {
    [key: string]: {
        accepted: number;
        dismissed: number;
    };
}

async function getPreferencePath(): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error('No workspace folder is open to save preferences.');
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    return path.resolve(workspaceRoot, '.agent', 'preferences.json');
}

async function loadPreferences(): Promise<PreferenceData> {
    const preferencePath = await getPreferencePath();
    try {
        const data = await fs.readFile(preferencePath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        // File might not exist yet
        return {};
    }
}

async function savePreferences(data: PreferenceData): Promise<void> {
    const preferencePath = await getPreferencePath();
    // Ensure .agent directory exists
    await fs.mkdir(path.dirname(preferencePath), { recursive: true });
    await fs.writeFile(preferencePath, JSON.stringify(data, null, 4));
}

export function getStorePreferenceToolDefinition() {
    return {
        name: 'StorePreferenceTool',
        description: {
            title: "Store User Preference",
            description: "Records whether the user accepted or dismissed a specific type of suggestion. This helps the AI learn user preferences over time.",
            inputSchema: storeInputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ suggestionType, accepted }: z.infer<typeof storeInputSchema>): Promise<z.infer<typeof outputSchema>> => {
            try {
                const preferences = await loadPreferences();

                if (!preferences[suggestionType]) {
                    preferences[suggestionType] = { accepted: 0, dismissed: 0 };
                }

                if (accepted) {
                    preferences[suggestionType].accepted++;
                } else {
                    preferences[suggestionType].dismissed++;
                }

                await savePreferences(preferences);

                const message = `Recorded preference for ${suggestionType}: ${accepted ? 'accepted' : 'dismissed'}`;
                return { message };
            } catch (error: any) {
                throw new Error(`Failed to store preference. Error: ${error.message}`);
            }
        }
    };
}

export function getGetPreferenceToolDefinition() {
    return {
        name: 'GetPreferenceTool',
        description: {
            title: "Get User Preference",
            description: "Retrieves the user's learned preference for a specific type of suggestion based on their past acceptance/dismissal patterns.",
            inputSchema: getInputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ suggestionType }: z.infer<typeof getInputSchema>): Promise<z.infer<typeof outputSchema>> => {
            try {
                const preferences = await loadPreferences();

                const data = preferences[suggestionType];
                if (!data) {
                    return { message: `neutral (no history for ${suggestionType})` };
                }

                const acceptedCount = data.accepted || 0;
                const dismissedCount = data.dismissed || 0;

                let preference: UserPreference = 'neutral';
                if (dismissedCount > acceptedCount && dismissedCount > 2) {
                    preference = 'negative';
                } else if (acceptedCount > dismissedCount && acceptedCount > 2) {
                    preference = 'positive';
                }

                const message = `${preference} (${acceptedCount} accepted, ${dismissedCount} dismissed)`;
                return { message };
            } catch (error: any) {
                throw new Error(`Failed to get preference. Error: ${error.message}`);
            }
        }
    };
}
