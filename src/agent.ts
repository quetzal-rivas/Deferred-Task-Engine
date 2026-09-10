import { StateGraph, END, Annotation } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DeferredTaskPayload, ExecutionResult } from './types.js';
import { McpClientManager, McpServerConfig } from './mcp_client.js';

// Define the State Annotation
const AgentState = Annotation.Root({
  payload: Annotation<DeferredTaskPayload>(),
  primaryError: Annotation<string | null>(),
  executionResult: Annotation<ExecutionResult | null>()
});

export async function executeAgentWorkflow(payload: DeferredTaskPayload): Promise<ExecutionResult> {
  const mcpManager = new McpClientManager();

  try {
    // Node A: Execute Primary Task
    const executePrimaryNode = async (state: typeof AgentState.State) => {
      console.log(`[Agent Workflow] Executing Primary Node for Task: ${state.payload.taskId}`);
      
      const primaryTool = state.payload.toolsWhitelist[0] || 'gmail';
      
      // MCP Server Config derived from env or sensible defaults
      const mcpConfig: McpServerConfig = {
        command: process.env[`${primaryTool.toUpperCase()}_MCP_SERVER_COMMAND`] || 'npx',
        args: (process.env[`${primaryTool.toUpperCase()}_MCP_SERVER_ARGS`] || `-y,@modelcontextprotocol/server-${primaryTool}`).split(',')
      };

      try {
        await mcpManager.connectServer(primaryTool, mcpConfig);
        const tools = await mcpManager.getLangChainTools(primaryTool);

        const llm = new ChatOpenAI({
          modelName: 'gpt-4o-mini',
          temperature: 0
        }).bindTools(tools);

        const prompt = `Primary Task Instructions: ${state.payload.primaryInstructions}\n` +
          `Contact Overrides: ${JSON.stringify(state.payload.edgeCasePolicies.contactOverrides)}`;

        const response = await llm.invoke([
          new SystemMessage('You are a background autonomous task agent executing a scheduled workflow.'),
          new HumanMessage(prompt)
        ]);

        return {
          primaryError: null,
          executionResult: {
            success: true,
            taskId: state.payload.taskId,
            executedNode: 'primary' as const,
            output: typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
          }
        };
      } catch (error: any) {
        console.error(`[Agent Workflow] Primary execution failed: ${error.message}`);
        return {
          primaryError: error.message || 'Unknown primary execution error',
          executionResult: null
        };
      }
    };

    // Node B: Escalation / Fallback Node
    const executeEscalationNode = async (state: typeof AgentState.State) => {
      console.log(`[Agent Workflow] Executing Escalation Node for Task: ${state.payload.taskId}`);
      
      const escalationTool = state.payload.edgeCasePolicies.escalationTool || 'elevenlabs';
      const mcpConfig: McpServerConfig = {
        command: process.env[`${escalationTool.toUpperCase()}_MCP_SERVER_COMMAND`] || 'npx',
        args: (process.env[`${escalationTool.toUpperCase()}_MCP_SERVER_ARGS`] || `-y,elevenlabs-mcp-server`).split(',')
      };

      try {
        await mcpManager.connectServer(escalationTool, mcpConfig);
        const tools = await mcpManager.getLangChainTools(escalationTool);

        const llm = new ChatOpenAI({
          modelName: 'gpt-4o-mini',
          temperature: 0
        }).bindTools(tools);

        const escalationPrompt = `PRIMARY TASK FAILED WITH ERROR: "${state.primaryError}"\n` +
          `Escalation Instructions: ${state.payload.edgeCasePolicies.escalationInstructions}\n` +
          `Contact Overrides: ${JSON.stringify(state.payload.edgeCasePolicies.contactOverrides)}`;

        const response = await llm.invoke([
          new SystemMessage('You are an emergency escalation agent. Trigger necessary outbound alerts via the available tools.'),
          new HumanMessage(escalationPrompt)
        ]);

        return {
          executionResult: {
            success: true,
            taskId: state.payload.taskId,
            executedNode: 'escalation' as const,
            output: typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
          }
        };
      } catch (error: any) {
        console.error(`[Agent Workflow] Escalation node failed: ${error.message}`);
        return {
          executionResult: {
            success: false,
            taskId: state.payload.taskId,
            executedNode: 'escalation' as const,
            error: `Escalation failed: ${error.message}`
          }
        };
      }
    };

    // Routing Logic
    const routeAfterPrimary = (state: typeof AgentState.State) => {
      if (!state.primaryError) {
        return END;
      }

      const policy = state.payload.edgeCasePolicies.fallbackOnPrimaryFailure;
      console.log(`[Agent Workflow] Primary failed. Fallback Policy: ${policy}`);

      if (policy === 'escalate') {
        return 'escalation';
      } else if (policy === 'retry') {
        // Simple fallback check - escalate if retry logic is handled by queue
        return 'escalation';
      } else {
        return END; // 'abort' or unknown policy
      }
    };

    // Build StateGraph
    const workflow = new StateGraph(AgentState)
      .addNode('primary', executePrimaryNode)
      .addNode('escalation', executeEscalationNode)
      .addEdge('__start__', 'primary')
      .addConditionalEdges('primary', routeAfterPrimary, {
        escalation: 'escalation',
        [END]: END
      })
      .addEdge('escalation', END);

    const app = workflow.compile();

    const resultState = await app.invoke({
      payload,
      primaryError: null,
      executionResult: null
    });

    return resultState.executionResult || {
      success: false,
      taskId: payload.taskId,
      executedNode: 'primary',
      error: resultState.primaryError || 'Workflow ended without output'
    };

  } finally {
    await mcpManager.closeAll();
  }
}
