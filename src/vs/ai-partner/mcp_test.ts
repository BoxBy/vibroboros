import { McpServer, McpClient, DuplexTransport } from "@modelcontextprotocol/sdk";
import { z } from "zod";
import { createInProcessStreamPair } from "./mcp_in_process";

async function runTest() {
    console.log("MCP Test: Starting...");

    // 1. Create the server
    const server = new McpServer({
        name: "test-server",
        version: "1.0.0",
    });

    // 2. Register a simple tool
    server.registerTool(
        "add",
        {
            title: "Addition Tool",
            description: "Adds two numbers",
            inputSchema: z.object({
                a: z.number(),
                b: z.number(),
            }),
        },
        async (params) => {
            const result = params.a + params.b;
            return { content: [{ type: "text", text: String(result) }] };
        }
    );

    // 3. Set up the in-process transport
    const [serverStream, clientStream] = createInProcessStreamPair();
    const serverTransport = new DuplexTransport(serverStream);
    server.connect(serverTransport);

    // 4. Create and start the client
    const clientTransport = new DuplexTransport(clientStream);
    const client = new McpClient(clientTransport);
    await client.start();

    console.log("MCP Test: Client and Server started.");

    // 5. Get tool schemas from the client
    const tools = await client.listTools();
    console.log("MCP Test: Tools listed by client:", tools);

    // 6. Call the tool
    console.log("MCP Test: Calling 'add' tool with { a: 5, b: 10 }");
    const result = await client.callTool("add", { a: 5, b: 10 });
    console.log("MCP Test: Tool call result:", result);

    if (result.content[0].text !== "15") {
        throw new Error("MCP Test Failed: Incorrect result from add tool.");
    }

    console.log("MCP Test: Success!");
}

runTest().catch(err => {
    console.error("MCP Test Failed:", err);
    process.exit(1);
});
