/**
 * Common utility functions for language detection and file operations
 */

/**
 * Detects programming language from file path extension
 */
export function detectLanguageFromPath(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();

    const languageMap: Record<string, string> = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'py': 'python',
        'java': 'java',
        'go': 'go',
        'rb': 'ruby',
        'rs': 'rust',
        'cpp': 'cpp',
        'c': 'c',
        'cs': 'csharp',
        'php': 'php',
        'swift': 'swift',
        'kt': 'kotlin',
        'scala': 'scala'
    };

    return languageMap[extension || ''] || 'code';
}

/**
 * Gets test framework for a given language
 */
export function getTestFramework(language: string): string {
    const frameworkMap: Record<string, string> = {
        'python': 'pytest',
        'javascript': 'jest',
        'typescript': 'jest',
        'java': 'junit',
        'go': 'testing',
        'ruby': 'rspec',
        'rust': 'cargo test',
        'csharp': 'nunit',
        'php': 'phpunit'
    };

    return frameworkMap[language] || 'test framework';
}

