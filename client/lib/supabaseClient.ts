import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) return null;
  if (!cached) {
    cached = createClient(url, anon, {
      auth: {
        // Host login uses Supabase Auth, so the session must survive a page
        // reload. This was previously false, which would have silently logged
        // the host out on every refresh.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return cached;
}
