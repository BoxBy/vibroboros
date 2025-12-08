// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { activate as activateAIPartner, deactivate as deactivateAIPartner } from './vs/ai-partner/extension';
import { SecretStorageService } from './vs/ai-partner/secret_storage_service';

/**
 * This method is called when the extension is activated.
 * The extension is activated the very first time a command is executed
 * or when a view is opened.
 * @param {vscode.ExtensionContext} context - The context in which the extension is running.
 */
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	    // This line of code will only be executed once when your extension is activated
	    console.log('Congratulations, your extension "viper" is now active!');

	    // Initialize Viper subsystem
	try {
		// Initialize SecretStorage
		SecretStorageService.initialize(context);

		// Activate Viper subsystem
		await activateAIPartner(context);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('Failed to activate Viper subsystem:', msg);
	}
}

/**
 * This method is called when the extension is deactivated.
 * It is used to clean up resources.
 */
export function deactivate() {
	try {
		deactivateAIPartner?.();
	} catch {
		// ignore
	}
}
