import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Secret-key client, server-only. Used for the rate-limit RPC, generating auth email links, and the
// account-type steps before a user has a session (features/account-types.md). Never for a user's
// own requests: those go through the cookie-bound client in ./server.ts.
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
