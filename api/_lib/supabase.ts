import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabase;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const { error } = await getSupabase().from('server_metrics').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export function handleSupabaseError(error: unknown, context: string): never {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: string }).message)
      : 'Unknown database error';
  throw new DatabaseError(`${context}: ${message}`, error);
}
