import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { DeferredTaskPayloadSchema } from './types.js';
import { scheduleDeferredTask, startWorker } from './queue.js';
import { logTaskToSupabase } from './db.js';
import { scheduleAwsEventBridgeTask } from './aws_scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Start the background BullMQ worker along with the server
startWorker();

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

    const payload = parseResult.data;
    
    // 1. Schedule locally in BullMQ (Redis)
    const job = await scheduleDeferredTask(payload);

    // 2. Schedule in Cloud via AWS EventBridge Scheduler (Dual-Tier Timers)
    await scheduleAwsEventBridgeTask(payload);

    // 3. Persist scheduled event state in Supabase
    await logTaskToSupabase(payload.taskId, payload, 'scheduled');

    res.status(200).json({
      status: 'scheduled',
      jobId: job.id,
      taskId: payload.taskId,
      targetTime: payload.targetTime,
      orchestration: 'Hybrid (AWS EventBridge + BullMQ/Redis + Supabase DB)'
    });
  } catch (error: any) {
    console.error('[Server Error]:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Deferred Autonomous Task Execution Engine running on port ${PORT}`);
});
