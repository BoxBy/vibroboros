import * as vscode from 'vscode';
/**
 * This method is called when the extension is activated.
 * The extension is activated the very first time a command is executed
 * or when a view is opened.
 * @param {vscode.ExtensionContext} context - The context in which the extension is running.
 */
export declare function activate(context: vscode.ExtensionContext): Promise<void>;
/**
 * This method is called when the extension is deactivated.
 * It is used to clean up resources.
 */
export declare function deactivate(): void;
