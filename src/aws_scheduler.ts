import { SchedulerClient, CreateScheduleCommand } from '@aws-sdk/client-scheduler';
import { DeferredTaskPayload } from './types.js';

const awsRegion = process.env.AWS_REGION || 'us-east-1';

export const schedulerClient = new SchedulerClient({
  region: awsRegion
});

export async function scheduleAwsEventBridgeTask(payload: DeferredTaskPayload) {
  const targetTimeIso = new Date(payload.targetTime).toISOString().split('.')[0]; // Format: YYYY-MM-DDTHH:mm:ss

  const scheduleCommand = new CreateScheduleCommand({
    Name: `deferred-task-${payload.taskId}`,
    ScheduleExpression: `at(${targetTimeIso})`,
    FlexibleTimeWindow: { Mode: 'OFF' },
    Target: {
      Arn: process.env.AWS_SQS_QUEUE_ARN || 'arn:aws:sqs:us-east-1:123456789012:deferred-tasks-queue',
      RoleArn: process.env.AWS_EVENTBRIDGE_ROLE_ARN || 'arn:aws:iam::123456789012:role/EventBridgeSqsRole',
      Input: JSON.stringify(payload)
    },
    ActionAfterCompletion: 'DELETE'
  });

  console.log(`[AWS EventBridge] Scheduling Cloud Timer for Task ${payload.taskId} at ${targetTimeIso}`);
  
  try {
    const response = await schedulerClient.send(scheduleCommand);
    return response;
  } catch (err: any) {
    console.warn(`[AWS EventBridge Warning] Failed to schedule with AWS EventBridge: ${err.message}. Falling back to local BullMQ timer.`);
    return null;
  }
}
