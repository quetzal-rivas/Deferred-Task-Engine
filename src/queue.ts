import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { DeferredTaskPayload, ExecutionResult } from './types.js';
import { executeAgentWorkflow } from './agent.js';
import { logTaskToSupabase } from './db.js';

const QUEUE_NAME = 'deferred-tasks';

export const redisConnection = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null
});

export const taskQueue = new Queue<DeferredTaskPayload>(QUEUE_NAME, {
  connection: redisConnection
});

export async function scheduleDeferredTask(payload: DeferredTaskPayload) {
  const targetTimeMs = new Date(payload.targetTime).getTime();
  const currentTimeMs = Date.now();
  const delay = Math.max(0, targetTimeMs - currentTimeMs);

  console.log(`[Queue] Scheduling Task ${payload.taskId} with delay of ${delay}ms (Target: ${payload.targetTime})`);

  const job = await taskQueue.add('execute-task', payload, {
    jobId: payload.taskId,
    delay,
    removeOnComplete: false,
    removeOnFail: false
  });

  return job;
}

export function startWorker() {
  const worker = new Worker<DeferredTaskPayload, ExecutionResult>(
    QUEUE_NAME,
    async (job: Job<DeferredTaskPayload>) => {
      console.log(`[Worker] Starting execution for job ${job.id} (Task ID: ${job.data.taskId})`);
      const result = await executeAgentWorkflow(job.data);
      if (!result.success) {
        throw new Error(result.error || 'Execution failed');
      }
      return result;
    },
    {
      connection: redisConnection,
      concurrency: 5
    }
  );

  worker.on('completed', async (job: Job, result: ExecutionResult) => {
    console.log(`[Worker] Job ${job.id} completed successfully via node '${result.executedNode}'`);
    if (job.data?.taskId) {
      await logTaskToSupabase(job.data.taskId, job.data, 'completed', result);
    }
  });

  worker.on('failed', async (job: Job | undefined, err: Error) => {
    console.error(`[Worker] Job ${job?.id} failed with error: ${err.message}`);
    if (job?.data?.taskId) {
      await logTaskToSupabase(job.data.taskId, job.data, 'failed', { error: err.message });
    }
  });

  return worker;
}
