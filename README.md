# Deferred Autonomous Task Execution Engine

A resilient, hybrid Durable Execution and Agent Graph pattern application built with Node.js, TypeScript, BullMQ, LangGraph, Model Context Protocol (MCP), and Supabase.

## 📁 Location & Standards Compliance
This project strictly follows the workspace guidelines in [`/Users/aztecgod/Active-Projects/README.txt`](file:///Users/aztecgod/Active-Projects/README.txt):
- **Path:** `/Users/aztecgod/Active-Projects/AI/Deferred-Task-Engine`
- **Category:** `AI/`
- **Isolated Environment:** Independent `package.json`, `.env`, `.gitignore`, and Git repository.

## 🏗 Architecture
1. **API Ingestion (`src/server.ts`):** Validates scheduled task payloads from live LLMs using Zod.
2. **Orchestration (`src/queue.ts`):** Relies on BullMQ and Redis for durable, crash-proof deferred execution delays.
3. **Execution Layer (`src/agent.ts`):** LangGraph StateGraph agent node execution with automatic edge escalation handling.
4. **MCP Client Wrapper (`src/mcp_client.ts`):** Connects to dynamic MCP servers (Gmail, ElevenLabs) over Stdio transport.
5. **Database Persistence (`src/db.ts`):** Logs task state (`scheduled`, `completed`, `failed`) directly into Supabase PostgreSQL (`ephemeral_context` table).

## 🚀 Running the Project

1. Start Redis:
```bash
docker run -d --name redis-deferred-engine -p 6379:6379 redis:alpine
```

2. Start the Engine:
```bash
npm run dev
```

3. Schedule a Task:
```bash
curl -X POST http://localhost:3000/schedule_task \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-202",
    "targetTime": "2026-09-10T18:00:00Z",
    "primaryInstructions": "Send summary report via email.",
    "toolsWhitelist": ["gmail"],
    "edgeCasePolicies": {
      "fallbackOnPrimaryFailure": "escalate",
      "escalationTool": "elevenlabs",
      "escalationInstructions": "Trigger voice alert call if email fails.",
      "contactOverrides": {
        "boss": "boss@example.com"
      }
    }
  }'
```
