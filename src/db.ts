import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://jcqdbxmqfpeixwyfuqfw.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseKey) {
      console.warn('[Supabase] Warning: Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY. Ephemeral memory mode fallback enabled.');
    }

    supabaseClient = createClient(supabaseUrl, supabaseKey || 'placeholder-key');
  }
  return supabaseClient;
}

export async function logTaskToSupabase(taskId: string, payload: any, status: 'scheduled' | 'completed' | 'failed', result?: any) {
  try {
    const supabase = getSupabase();
    await supabase.from('ephemeral_context').insert({
      task_id: taskId,
      payload: JSON.stringify(payload),
      status: status,
      result: result ? JSON.stringify(result) : null,
      updated_at: new Date().toISOString()
    });
  } catch (err: any) {
    console.error(`[Supabase Log Error]: ${err.message}`);
  }
}
