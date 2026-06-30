import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseKey);
  }

  return client;
}

export async function fetchPublicMetrics() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_metrics')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data;
}
