/**
 * Interface for File Operation Service
 * Handles file read, write, and other file operations
 */

export interface IFileOperationService {
    /**
     * Read file content
     */
    readFile(filePath: string, options?: { startLine?: number; endLine?: number }): Promise<{
        success: boolean;
        content?: string;
        error?: string;
    }>;

    /**
     * Write file content
     */
    writeFile(filePath: string, content: string): Promise<{
        success: boolean;
        error?: string;
    }>;

    /**
     * Append to file
     */
    appendFile(filePath: string, content: string): Promise<{
        success: boolean;
        error?: string;
    }>;

    /**
     * Delete file
     */
    deleteFile(filePath: string): Promise<{
        success: boolean;
        error?: string;
    }>;

    /**
     * Replace content in file
     */
    replaceInFile(filePath: string, search: string, replace: string, options?: {
        matchCase?: boolean;
        useRegex?: boolean;
    }): Promise<{
        success: boolean;
        replacements?: number;
        error?: string;
    }>;

    /**
     * List directory
     */
    listDirectory(dirPath: string, recursive?: boolean): Promise<{
        success: boolean;
        files?: string[];
        error?: string;
    }>;
}
