// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { activate as activateAIPartner, deactivate as deactivateAIPartner } from './vs/ai-partner/extension';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vibroboros" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('vibroboros.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Vibroboros!');
	});

	context.subscriptions.push(disposable);

	// Initialize AI Partner subsystem
	try {
		activateAIPartner(context);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('Failed to activate AI Partner subsystem:', msg);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	try {
		deactivateAIPartner?.();
	} catch {
		// ignore
	}
}
