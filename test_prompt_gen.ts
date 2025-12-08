import { getConversationalPrompt } from './src/vs/ai-partner/agents/prompts';

async function test() {
    try {
        const prompt = await getConversationalPrompt("Hello Viper");
        console.log("Generated Prompt:\n", prompt);
        
        if (prompt.includes("You are Viper") && prompt.includes("Rules:")) {
            console.log("SUCCESS: Prompt contains expected sections.");
        } else {
            console.error("FAILURE: Prompt missing sections.");
        }
    } catch (e) {
        console.error("Error generating prompt:", e);
    }
}

test();
