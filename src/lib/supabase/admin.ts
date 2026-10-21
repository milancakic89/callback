import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Secret-key client. Only used for the rate-limit RPC; never for user-facing auth.
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
