export class TemplateEngine {
    static resolve(template: string, placeholders: Record<string, string>): string {
        let result = template;
        for (const [key, value] of Object.entries(placeholders)) {
            const placeholder = `{{${key}}}`;
            result = result.replace(new RegExp(placeholder, 'g'), value);
        }
        return result;
    }
}
