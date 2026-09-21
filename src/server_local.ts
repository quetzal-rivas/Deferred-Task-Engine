import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { DeferredTaskPayloadSchema, DeferredTaskPayload } from './types';
import { executeAgentWorkflow } from './agent';
import { logTaskToSupabase } from './db';

dotenv.config();

const app = express();
const PORT = process.env.TEST_PORT || 3009;

app.use(express.json());

// In-Memory Timer Store for 100% local testing without Docker/Redis
const scheduledTimers = new Map<string, NodeJS.Timeout>();

console.log('================================================================');
console.log('🚀 Deferred Task Execution Engine - Local Test Server');
console.log('   Mode: Pure Local In-Memory Timers + LangGraph StateGraph');
console.log('================================================================');

app.post('/schedule_task', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = DeferredTaskPayloadSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid Task Payload',
        details: parseResult.error.format()
      });
      return;
    }

    const payload: DeferredTaskPayload = parseResult.data;
    const targetTimeMs = new Date(payload.targetTime).getTime();
    const delayMs = Math.max(0, targetTimeMs - Date.now());

    console.log(`\n[📥 API Ingest] Received Task Payload: ${payload.taskId}`);
    console.log(`[⏱️ Timer] Scheduled to wake up in ${Math.round(delayMs / 1000)} seconds (Target: ${payload.targetTime})`);

    // Log to Supabase DB
    await logTaskToSupabase(payload.taskId, payload, 'scheduled');

    // Local Timer mechanism
    const timer = setTimeout(async () => {
      console.log(`\n[⏰ Timer Triggered!] Waking up Task: ${payload.taskId}`);
      console.log(`[🕸️ LangGraph Engine] Initializing StateGraph Workflow...`);

      const result = await executeAgentWorkflow(payload);
      
      console.log(`[✅ Workflow Completed] Result:`, JSON.stringify(result, null, 2));
      await logTaskToSupabase(payload.taskId, payload, result.success ? 'completed' : 'failed', result);
      scheduledTimers.delete(payload.taskId);
    }, delayMs);

    scheduledTimers.set(payload.taskId, timer);

    res.status(200).json({
      status: 'scheduled',
      taskId: payload.taskId,
      targetTime: payload.targetTime,
      delaySeconds: Math.round(delayMs / 1000),
      engine: 'LangGraph StateGraph',
      timerMechanism: 'Local In-Memory / BullMQ'
    });
  } catch (error: any) {
    console.error('[Server Error]:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Server Ready] Listening on http://localhost:${PORT}`);
  console.log(`Send POST requests to http://localhost:${PORT}/schedule_task`);
});
