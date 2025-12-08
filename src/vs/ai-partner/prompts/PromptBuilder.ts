export class PromptBuilder {
    private sections: string[] = [];

    constructor(private readonly baseSystemPrompt?: string) {
        if (baseSystemPrompt) {
            this.sections.push(baseSystemPrompt);
        }
    }

    addSection(content: string, condition: boolean = true): this {
        if (condition && content) {
            this.sections.push(content);
        }
        return this;
    }

    build(): string {
        return this.sections.join('\n\n');
    }
}
