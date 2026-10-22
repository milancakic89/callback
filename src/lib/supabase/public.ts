import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Publishable-key client with no cookies, so `'use cache'` functions can use it (they can't read
// `cookies()`). RLS limits it to what `anon` can see: active jobs only.
export const supabasePublic = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
