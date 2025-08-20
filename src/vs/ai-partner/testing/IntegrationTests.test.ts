import * as assert from 'assert';
import { MCPServer } from '../server/MCPServer';
import { MCPMessage } from '../interfaces/MCPMessage';

// This suite simulates the interaction between an MCP Client (like our OrchestratorAgent)
// and the MCPServer, according to the MCP documentation.
suite('Integration Test: MCP Client-Server Interaction', () => {

    let server: MCPServer;

    // Setup the server once before all tests in this suite
    suiteSetup(() => {
        server = new MCPServer();
    });

    test('Step 1: MCP Client can call a tool and receive a successful result', async () => {
        // This simulates a `tools/call` request as described in the MCP docs.
        const toolCallRequest: MCPMessage<any> = {
            jsonrpc: '2.0',
            id: 'test-id-1',
            method: 'tools/call',
            params: {
                name: 'WebSearchTool',
                arguments: { query: 'A2A Protocol' }
            }
        };

        const response = await server.handleRequest(toolCallRequest);

        assert.deepStrictEqual(response, {
            jsonrpc: '2.0',
            id: 'test-id-1',
            result: {
                content: [
                    {
                        type: 'text',
                        text: 'Search results for "A2A Protocol" would appear here.'
                    }
                ]
            }
        });
    });

    test('Step 2: MCP Client receives an error for a non-existent tool', async () => {
        const toolCallRequest: MCPMessage<any> = {
            jsonrpc: '2.0',
            id: 'test-id-2',
            method: 'tools/call',
            params: {
                name: 'NonExistentTool',
                arguments: {}
            }
        };

        const response = await server.handleRequest(toolCallRequest);

        assert.deepStrictEqual(response, {
            jsonrpc: '2.0',
            id: 'test-id-2',
            error: {
                code: -32601, // Method not found
                message: "Tool 'NonExistentTool' not found."
            }
        });
    });

    test('Step 3: MCP Client receives an error for missing required parameters', async () => {
        const toolCallRequest: MCPMessage<any> = {
            jsonrpc: '2.0',
            id: 'test-id-3',
            method: 'tools/call',
            params: {
                name: 'GitAutomationTool',
                arguments: {} // Missing the required 'args' parameter
            }
        };

        const response = await server.handleRequest(toolCallRequest);

        assert.strictEqual(response.id, 'test-id-3');
        assert.strictEqual(response.error.code, -32602); // Invalid params
        assert.strictEqual(response.error.message, 'Args parameter is required for GitAutomationTool.');
    });
});
