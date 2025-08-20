import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * @interface FileReadParams
 * Defines the parameters for the FileReadTool.
 */
interface FileReadParams {
  filePath: string;
}

/**
 * @class FileReadTool
 * A tool for reading the contents of a file.
 */
export class FileReadTool {
  public getSchema() {
    return {
      type: "function",
      function: {
        name: "FileReadTool",
        description: "Reads the entire content of a specified file within the project workspace.",
        parameters: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The relative path to the file from the workspace root (e.g., 'src/utils.ts').",
            },
          },
          required: ["filePath"],
        },
      },
    };
  }

  /**
   * Executes the file read operation.
   * @param params The file path to read.
   * @returns A promise that resolves with the file content.
   */
  public async execute(params: FileReadParams): Promise<any[]> {
    console.log('[FileReadTool] Executing with params:', params);

    if (!params.filePath) {
      throw new Error('filePath parameter is required for FileReadTool.');
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder is open.');
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const absolutePath = path.resolve(workspaceRoot, params.filePath);

    // Security check: Ensure the path is within the workspace
    if (!absolutePath.startsWith(workspaceRoot)) {
        throw new Error('File path is outside of the allowed workspace directory.');
    }

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');
      return [
        {
          type: 'text',
          text: `Content of ${params.filePath}:\n---\n${content}`,
        },
      ];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found at path: ${params.filePath}`);
      }
      throw error; // Rethrow other errors
    }
  }
}
