import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodeAnalysisAgent } from '../agents/CodeAnalysisAgent';
import { GitAutomationTool } from '../server/tools/GitAutomationTool';
import { A2AMessage } from '../interfaces/A2AMessage';

// Helper to create a functional Memento mock for testing
const createMockMemento = (): vscode.Memento => {
    let storage: { [key: string]: any } = {};
    return {
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            if (key in storage) {
                return storage[key];
            }
            return defaultValue;
        },
        update: (key: string, value: any): Promise<void> => {
            storage[key] = value;
            return Promise.resolve();
        },
        keys: (): readonly string[] => Object.keys(storage)
    };
};

suite('Unit Tests', () => {

  suite('CodeAnalysisAgent', () => {
    // This test is now async to handle the async nature of the message handler.
    test('Should handle a search request and dispatch a response', async () => {
      // We wrap the asynchronous part in a Promise to await its completion.
      await new Promise<void>(resolve => {
        const mockDispatch = (message: A2AMessage<any>) => {
          assert.strictEqual(message.recipient, 'OrchestratorAgent');
          assert.strictEqual(message.type, 'response-codebase-search');
          assert.deepStrictEqual(message.payload, { results: [] });
          resolve(); // Resolve the promise when the callback is executed.
        };

        const mockMemento = createMockMemento();
        mockMemento.update('aiPartnerCodebaseIndex', {});

        const agent = new CodeAnalysisAgent(mockDispatch, mockMemento);

        const triggerMessage: A2AMessage<{ symbolName: string }> = {
          sender: 'OrchestratorAgent',
          recipient: 'CodeAnalysisAgent',
          timestamp: new Date().toISOString(),
          type: 'request-codebase-search',
          payload: { symbolName: 'testSymbol' },
        };

        // Call the corrected and async method.
        agent.handleA2AMessage(triggerMessage);
      });
    });
  });

  suite('GitAutomationTool', () => {
    let tool: GitAutomationTool;

    suiteSetup(() => {
      tool = new GitAutomationTool();
    });

    test('Should correctly prepare a git status command and return it in a content array', async () => {
      const params = { args: ['status'] };
      const result = await tool.execute(params);
      assert.deepStrictEqual(result, [
        {
          type: 'text',
          text: 'Prepared command: git status',
        },
      ]);
    });

    test('Should throw an error if no args are provided', async () => {
      const params = { args: [] };
      await assert.rejects(
        async () => {
          await tool.execute(params);
        },
        {
          name: 'Error',
          message: 'Args parameter is required for GitAutomationTool.',
        }
      );
    });
  });
});
