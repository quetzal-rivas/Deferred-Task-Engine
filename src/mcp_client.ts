import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class McpClientManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();

  async connectServer(name: string, config: McpServerConfig): Promise<Client> {
    if (this.clients.has(name)) {
      return this.clients.get(name)!;
    }

    const envVars: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) envVars[k] = v;
    }
    if (config.env) {
      for (const [k, v] of Object.entries(config.env)) {
        if (v !== undefined) envVars[k] = v;
      }
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: envVars
    });

    const client = new Client(
      { name: `deferred-engine-${name}`, version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    this.clients.set(name, client);
    this.transports.set(name, transport);
    return client;
  }

  async getLangChainTools(serverName: string): Promise<DynamicStructuredTool[]> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP Client '${serverName}' is not connected.`);
    }

    const { tools } = await client.listTools();

    return tools.map((tool) => {
      return new DynamicStructuredTool({
        name: `${serverName}_${tool.name}`,
        description: tool.description || `Tool ${tool.name} from ${serverName}`,
        schema: z.object({}).passthrough(), // Accepts flexible dynamic schema
        func: async (args: Record<string, any>) => {
          const result = await client.callTool({
            name: tool.name,
            arguments: args
          });
          return JSON.stringify(result.content);
        }
      });
    });
  }

  async closeAll() {
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.close();
      } catch (err) {
        console.error(`Error closing MCP client ${name}:`, err);
      }
    }
    this.clients.clear();
    this.transports.clear();
  }
}
