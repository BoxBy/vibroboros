import * as path from 'path';

export type LanguageFamily = 'python_like' | 'c_like' | 'js_like' | 'script_like' | 'markup' | 'generic';

export interface LanguageProfile {
    id: string;               // e.g. "python", "typescript"
    family: LanguageFamily;
    label: string;            // Human-readable label for prompts
    indentation: { style: 'spaces' | 'tabs'; size: number };
    lineEnding: 'lf' | 'crlf';
    commentStyle: 'hash' | 'slash' | 'docstring' | 'mixed';
    testingHints: {
        filePatterns: string[];
        styleNotes: string[];
    };
    codeConventions: string[];
}

const DEFAULT_PROFILE: LanguageProfile = {
    id: 'code',
    family: 'generic',
    label: 'code',
    indentation: { style: 'spaces', size: 4 },
    lineEnding: 'lf',
    commentStyle: 'mixed',
    testingHints: {
        filePatterns: [],
        styleNotes: []
    },
    codeConventions: [
        'Return a single self-contained file that can run without manual fixes.',
        'Keep formatting and whitespace consistent and idiomatic for the language.'
    ]
};

function normalizeLangId(raw: string | undefined): string {
    if (!raw) return '';
    return raw.toLowerCase().trim();
}

export function inferLanguageIdFromRequest(request: string): string {
    // Language detection from request text removed - use file extension or LLM inference instead
    return '';
}

export function inferLanguageIdFromPath(filePath: string | undefined): string {
    if (!filePath) return '';
    const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
    switch (ext) {
        case 'py': return 'python';
        case 'ts':
        case 'tsx': return 'typescript';
        case 'js':
        case 'jsx': return 'javascript';
        case 'cs': return 'csharp';
        case 'java': return 'java';
        case 'go': return 'go';
        case 'rs': return 'rust';
        case 'kt':
        case 'kts': return 'kotlin';
        case 'swift': return 'swift';
        case 'rb': return 'ruby';
        default: return '';
    }
}

export function getLanguageProfile(langIdRaw: string | undefined): LanguageProfile {
    const langId = normalizeLangId(langIdRaw);
    switch (langId) {
        case 'python':
            return {
                id: 'python',
                family: 'python_like',
                label: 'Python 3',
                indentation: { style: 'spaces', size: 4 },
                lineEnding: 'lf',
                commentStyle: 'hash',
                testingHints: {
                    filePatterns: ['test_*.py', '*_test.py'],
                    styleNotes: [
                        'Use pytest-style tests when generating tests unless the user explicitly requests unittest.',
                        'Name test files like test_foo.py when creating new tests.'
                    ]
                },
                codeConventions: [
                    'Use 4 spaces per indentation level. Never use tabs.',
                    'Ensure blocks are indented consistently to avoid IndentationError.',
                    'Prefer snake_case for functions and variables.',
                    'Include a main guard (if __name__ == "__main__":) only when running as a script.'
                ]
            };
        case 'typescript':
            return {
                id: 'typescript',
                family: 'js_like',
                label: 'TypeScript',
                indentation: { style: 'spaces', size: 2 },
                lineEnding: 'lf',
                commentStyle: 'slash',
                testingHints: {
                    filePatterns: ['*.spec.ts', '*.test.ts'],
                    styleNotes: [
                        'Use Jest-style or Vitest-style tests when generating tests unless the user requests another framework.',
                        'Keep imports relative and avoid default exports unless they are already used in the project.'
                    ]
                },
                codeConventions: [
                    'Prefer explicit types for public interfaces and function signatures.',
                    'Use async/await instead of raw Promise chains when possible.',
                    'Keep imports sorted and avoid unused imports.'
                ]
            };
        case 'javascript':
            return {
                id: 'javascript',
                family: 'js_like',
                label: 'JavaScript',
                indentation: { style: 'spaces', size: 2 },
                lineEnding: 'lf',
                commentStyle: 'slash',
                testingHints: {
                    filePatterns: ['*.spec.js', '*.test.js'],
                    styleNotes: [
                        'Use Jest-style tests unless the user specifies another framework.',
                        'Do not introduce new global variables; keep everything in modules.'
                    ]
                },
                codeConventions: [
                    'Use async/await where appropriate.',
                    'Prefer const/let over var.',
                    'Follow existing project style when visible; otherwise default to modern ES modules.'
                ]
            };
        case 'java':
            return {
                id: 'java',
                family: 'c_like',
                label: 'Java',
                indentation: { style: 'spaces', size: 4 },
                lineEnding: 'lf',
                commentStyle: 'slash',
                testingHints: {
                    filePatterns: ['*Test.java'],
                    styleNotes: ['Use JUnit-style tests when generating tests.']
                },
                codeConventions: [
                    'Use PascalCase for classes and camelCase for methods and variables.',
                    'Place one public class per file and match the file name to the public class name.'
                ]
            };
        case 'csharp':
            return {
                id: 'csharp',
                family: 'c_like',
                label: 'C#',
                indentation: { style: 'spaces', size: 4 },
                lineEnding: 'crlf',
                commentStyle: 'slash',
                testingHints: {
                    filePatterns: ['*Tests.cs'],
                    styleNotes: ['Use xUnit-style tests unless the user specifies MSTest or NUnit.']
                },
                codeConventions: [
                    'Use PascalCase for types and methods; camelCase for locals and parameters.',
                    'Group types logically into namespaces that match folder structure where possible.'
                ]
            };
        case 'go':
            return {
                id: 'go',
                family: 'c_like',
                label: 'Go',
                indentation: { style: 'tabs', size: 1 },
                lineEnding: 'lf',
                commentStyle: 'slash',
                testingHints: {
                    filePatterns: ['*_test.go'],
                    styleNotes: ['Use the standard testing package and TestXxx naming for test functions.']
                },
                codeConventions: [
                    'Rely on gofmt-style formatting; avoid manual alignment.',
                    'Keep package names short and lower_snake_case.'
                ]
            };
        case 'rust':
            return {
                id: 'rust',
                family: 'c_like',
                label: 'Rust',
                indentation: { style: 'spaces', size: 4 },
                lineEnding: 'lf',
                commentStyle: 'slash',
                testingHints: {
                    filePatterns: ['*_test.rs'],
                    styleNotes: ['Use Rust inline #[test] functions or module-level tests.']
                },
                codeConventions: [
                    'Follow rustfmt conventions.',
                    'Prefer explicit module structure over large monolithic files.'
                ]
            };
        case 'kotlin':
            return {
                id: 'kotlin',
                family: 'c_like',
                label: 'Kotlin',
                indentation: { style: 'spaces', size: 4 },
                lineEnding: 'lf',
                commentStyle: 'slash',
                testingHints: {
                    filePatterns: ['*Test.kt'],
                    styleNotes: []
                },
                codeConventions: [
                    'Prefer val over var where possible.',
                    'Use data classes for simple value holders.'
                ]
            };
        case 'ruby':
            return {
                id: 'ruby',
                family: 'script_like',
                label: 'Ruby',
                indentation: { style: 'spaces', size: 2 },
                lineEnding: 'lf',
                commentStyle: 'hash',
                testingHints: {
                    filePatterns: ['*_spec.rb'],
                    styleNotes: ['Use RSpec-style tests when guessing a default.']
                },
                codeConventions: [
                    'Prefer snake_case for methods and variables.',
                    'Use 2 spaces for indentation; never use tabs.'
                ]
            };
        default:
            return DEFAULT_PROFILE;
    }
}

export function buildLanguageStylePrompt(profile: LanguageProfile): string {
    const lines: string[] = [];
    lines.push(`Target language: ${profile.label}.`);
    lines.push(`Indentation: use ${profile.indentation.size} ${profile.indentation.style === 'spaces' ? 'spaces' : 'tabs'} per indentation level.`);
    if (profile.lineEnding === 'lf') {
        lines.push('Use "\n" (LF) for line endings.');
    } else {
        lines.push('Use "\r\n" (CRLF) for line endings.');
    }
    switch (profile.commentStyle) {
        case 'hash':
            lines.push('Use "#" style comments for inline explanations when needed.');
            break;
        case 'slash':
            lines.push('Use // and /* */ style comments according to the language conventions.');
            break;
        case 'docstring':
            lines.push('Use docstring-style comments for high-level explanations.');
            break;
        case 'mixed':
        default:
            break;
    }
    if (profile.testingHints.filePatterns.length > 0) {
        lines.push(`When creating test files, prefer patterns like: ${profile.testingHints.filePatterns.join(', ')}.`);
    }
    for (const note of profile.testingHints.styleNotes) {
        lines.push(note);
    }
    for (const rule of profile.codeConventions) {
        lines.push(rule);
    }
    return lines.join('\n- ');
}
