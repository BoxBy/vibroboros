import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * @interface FileWriteParams
 * Defines the parameters for the FileWriteTool.
 */
interface FileWriteParams {
  filePath: string;
  content: string;
}

/**
 * @class FileWriteTool
 * A tool for writing content to a file.
 */
export class FileWriteTool {
  public getSchema() {
    return {
      type: "function",
      function: {
        name: "FileWriteTool",
        description: "Writes or overwrites a file with the specified content within the project workspace. Use this to create new files or modify existing ones.",
        parameters: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The relative path for the file from the workspace root (e.g., 'src/new-feature.ts').",
            },
            content: {
              type: "string",
              description: "The full content to be written to the file.",
            },
          },
          required: ["filePath", "content"],
        },
      },
    };
  }

  /**
   * Executes the file write operation.
   * @param params The file path and content to write.
   * @returns A promise that resolves with a success message.
   */
  public async execute(params: FileWriteParams): Promise<any[]> {
    console.log('[FileWriteTool] Executing with params:', params.filePath);

    if (!params.filePath || params.content === undefined) {
      throw new Error('filePath and content parameters are required for FileWriteTool.');
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
      // Ensure the directory exists before writing the file
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, params.content, 'utf-8');
      return [
        {
          type: 'text',
          text: `Successfully wrote content to ${params.filePath}`,
        },
      ];
    } catch (error: any) {
      console.error('[FileWriteTool] Error:', error);
      throw new Error(`Failed to write file at path: ${params.filePath}. Error: ${error.message}`);
    }
  }
}
