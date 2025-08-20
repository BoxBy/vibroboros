import * as assert from 'assert';
import { CodeAnalysisAgent } from '../agents/CodeAnalysisAgent';
import { GitAutomationTool } from '../server/tools/GitAutomationTool';
import { A2AMessage } from '../interfaces/A2AMessage';

suite('Unit Tests', () => {

  suite('CodeAnalysisAgent', () => {
    test('Should generate and dispatch a code summary message', (done) => {
      // Mock the dispatch function to test if it gets called correctly.
      const mockDispatch = (message: A2AMessage<any>) => {
        assert.strictEqual(message.recipient, 'OrchestratorAgent');
        assert.strictEqual(message.type, 'response-code-summary');
        assert.strictEqual(message.payload.filePath, 'test.ts');
        assert.ok(message.payload.description.includes('summary for test.ts'));
        done(); // Signal that the async test is complete.
      };

      const agent = new CodeAnalysisAgent(mockDispatch);

      // Create a sample message to trigger the agent's logic.
      const triggerMessage: A2AMessage<{ filePath: string }> = {
        sender: 'OrchestratorAgent',
        recipient: 'CodeAnalysisAgent',
        timestamp: new Date().toISOString(),
        type: 'request-code-analysis',
        payload: { filePath: 'test.ts' },
      };

      agent.handleA2AMessage(triggerMessage);
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
