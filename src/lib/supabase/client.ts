import { createBrowserClient } from "@supabase/ssr";

type SupabaseBrowserClientOptions = {
  detectSessionInUrl?: boolean;
  isSingleton?: boolean;
};

export function createClient(options: SupabaseBrowserClientOptions = {}) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(typeof options.isSingleton === "boolean"
        ? { isSingleton: options.isSingleton }
        : {}),
      auth: {
        ...(typeof options.detectSessionInUrl === "boolean"
          ? { detectSessionInUrl: options.detectSessionInUrl }
          : {}),
      },
    },
  );
}
