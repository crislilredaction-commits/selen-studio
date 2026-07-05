import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseAdminClient = SupabaseClient;

export function createSupabaseAdminClient(): SupabaseAdminClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Configuration Supabase admin manquante : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as SupabaseAdminClient;
}
