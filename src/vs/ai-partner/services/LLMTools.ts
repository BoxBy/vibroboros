import type { LLMProvider } from './LLMService';

// Minimal OpenAI-style tool definitions for directory/file introspection
// Providers that ignore tools will simply skip these.
export function getCoreLLMTools(_provider?: LLMProvider) {
    const tools = [
        {
            type: 'function',
            function: {
                name: 'list_dir',
                description: 'List files and directories under a given path in the workspace.',
                parameters: {
                    type: 'object',
                    properties: {
                        dirPath: { type: 'string', description: 'Relative directory path from workspace root.' },
                        recursive: { type: 'boolean', description: 'Whether to traverse subdirectories.' },
                        pattern: { type: 'string', description: 'Glob-like pattern (e.g., **/*.ts).'},
                        ignore: { type: 'array', items: { type: 'string' }, description: 'Ignore patterns.' },
                        sortBy: { type: 'string', enum: ['name','size','mtime'], description: 'Sort key.' },
                        order: { type: 'string', enum: ['asc','desc'], description: 'Sort order.' },
                        start: { type: 'number', description: 'Pagination start index.' },
                        limit: { type: 'number', description: 'Pagination size.' },
                        roots: { type: 'string', enum: ['primary','all'], description: 'Which workspace roots to include.' },
                        followSymlinks: { type: 'boolean', description: 'Follow symlinks when recursive.' }
                    },
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'read_file',
                description: 'Read the content of a file in the workspace. Supports optional line ranges.',
                parameters: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string', description: 'Relative file path from workspace root.' },
                        startLine: { type: 'number', description: 'Start line number (1-based, inclusive).' },
                        endLine: { type: 'number', description: 'End line number (1-based, inclusive).' }
                    },
                    required: ['filePath'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_file_info',
                description: 'Check existence and metadata of a workspace path.',
                parameters: {
                    type: 'object',
                    properties: {
                        targetPath: { type: 'string', description: 'Relative file or directory path from workspace root.' }
                    },
                    required: ['targetPath'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'web_search',
                description: 'Performs a web search using a search engine. Use this for general research (RPD).',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The search query to execute.' }
                    },
                    required: ['query'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'run_command',
                description: 'Execute a shell command in the workspace root. Use this to verify your code (e.g., run tests, build).',
                parameters: {
                    type: 'object',
                    properties: {
                        command: { type: 'string', description: 'The command to execute.' }
                    },
                    required: ['command'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_definition',
                description: 'Get the definition of a symbol at a specific location. Use this to understand code structure.',
                parameters: {
                    type: 'object',
                    properties: {
                        file_path: { type: 'string', description: 'The file path containing the symbol.' },
                        line: { type: 'number', description: 'The line number (1-based).' },
                        character: { type: 'number', description: 'The character position (1-based).' }
                    },
                    required: ['file_path', 'line', 'character'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_references',
                description: 'Find references of a symbol at a specific location.',
                parameters: {
                    type: 'object',
                    properties: {
                        file_path: { type: 'string', description: 'The file path containing the symbol.' },
                        line: { type: 'number', description: 'The line number (1-based).' },
                        character: { type: 'number', description: 'The character position (1-based).' }
                    },
                    required: ['file_path', 'line', 'character'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'querySemanticGraph',
                description: 'Retrieve context from the Semantic Graph. Use this to find file dependencies, symbol definitions (with precise line ranges using LSP), or search the codebase.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The search term or file path.' },
                        type: { type: 'string', enum: ['search', 'file-related', 'symbol-lookup'], description: 'The type of query.' }
                    },
                    required: ['query', 'type'],
                    additionalProperties: false
                }
            }
        },


        {
            type: 'function',
            function: {
                name: 'write_to_file',
                description: 'Create a new file with the specified content. Also used for overwriting files completely.',
                parameters: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string', description: 'Relative file path from workspace root.' },
                        content: { type: 'string', description: 'The complete source code content of the file.' }
                    },
                    required: ['filePath', 'content'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'replace_file_content',
                description: 'Replace a specific range of lines in a file. Use this for editing existing files.',
                parameters: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string', description: 'Relative file path from workspace root.' },
                        startLine: { type: 'number', description: '1-based start line number.' },
                        endLine: { type: 'number', description: '1-based end line number (inclusive).' },
                        targetContent: { type: 'string', description: 'Exact content to be replaced (for verification).' },
                        replacementContent: { type: 'string', description: 'New content to insert.' }
                    },
                    required: ['filePath', 'startLine', 'endLine', 'targetContent', 'replacementContent'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'multi_replace_file_content',
                description: 'Replace multiple non-contiguous blocks in a single file.',
                parameters: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string', description: 'Relative file path from workspace root.' },
                        replacementChunks: { 
                            type: 'array', 
                            items: {
                                type: 'object',
                                properties: {
                                    startLine: { type: 'number' },
                                    endLine: { type: 'number' },
                                    targetContent: { type: 'string' },
                                    replacementContent: { type: 'string' }
                                },
                                required: ['startLine', 'endLine', 'targetContent', 'replacementContent']
                            },
                            description: 'List of replacement chunks.' 
                        }
                    },
                    required: ['filePath', 'replacementChunks'],
                    additionalProperties: false
                }
            }
        },

        {
            type: 'function',
            function: {
                name: 'memory_tool',
                description: 'Save a fact, user preference, or correction to long-term memory.',
                parameters: {
                    type: 'object',
                    properties: {
                        fact: { type: 'string', description: 'Concise fact to remember.' }
                    },
                    required: ['fact'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'open_browser',
                description: 'Open a URL in the browser.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'The URL to open.' }
                    },
                    required: ['url'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'store_preference',
                description: 'Record user preference for suggestion types.',
                parameters: {
                    type: 'object',
                    properties: {
                        suggestionType: { type: 'string' },
                        accepted: { type: 'boolean' }
                    },
                    required: ['suggestionType', 'accepted'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_preference',
                description: 'Retrieve user preference for a suggestion type.',
                parameters: {
                    type: 'object',
                    properties: {
                        suggestionType: { type: 'string' }
                    },
                    required: ['suggestionType'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'manage_context',
                description: 'Manage workspace context. Use this to summarize progress, clean up tokens, or refresh the semantic index.',
                parameters: {
                    type: 'object',
                    properties: {
                         mode: { type: 'string', enum: ['cleanup', 'summarize', 'indexing'], description: 'Action mode: cleanup (token flush), summarize (save history), indexing (refresh map).' },
                         instructions: { type: 'string', description: 'Optional specific instructions.' }
                    },
                    required: ['mode'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'submit_tasks',
                description: 'Submit a list of decomposed sub-tasks to the Orchestrator for execution.',
                parameters: {
                    type: 'object',
                    properties: {
                        tasks: { 
                            type: 'array', 
                            items: { type: 'string' },
                            description: 'List of sub-tasks strings.' 
                        }
                    },
                    required: ['tasks'],
                    additionalProperties: false
                }
            }
        },
    ];
    return tools as any[];
}
