import { z } from 'zod';

export const EdgeCasePoliciesSchema = z.object({
  fallbackOnPrimaryFailure: z.enum(['abort', 'escalate', 'retry']),
  escalationTool: z.string(),
  escalationInstructions: z.string(),
  contactOverrides: z.record(z.string(), z.string())
});

export const DeferredTaskPayloadSchema = z.object({
  taskId: z.string(),
  targetTime: z.string().datetime({ offset: true }).or(z.string().datetime()), // ISO format
  primaryInstructions: z.string(),
  toolsWhitelist: z.array(z.string()),
  edgeCasePolicies: EdgeCasePoliciesSchema
});

export type EdgeCasePolicies = z.infer<typeof EdgeCasePoliciesSchema>;
export type DeferredTaskPayload = z.infer<typeof DeferredTaskPayloadSchema>;

export interface ExecutionResult {
  success: boolean;
  taskId: string;
  executedNode: 'primary' | 'escalation';
  output?: string;
  error?: string;
}
