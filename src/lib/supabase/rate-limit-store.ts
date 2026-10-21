import "server-only";
import type { RateLimitStore } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Kept out of src/lib/rate-limit.ts so the secret-key client never enters proxy's import graph.
export const postgresStore: RateLimitStore = {
  async hit(key, windowMs) {
    const { data, error } = await supabaseAdmin
      .rpc("rate_limit_hit", { p_key: key, p_window_ms: windowMs })
      .single<{ count: number; reset_at: string }>();

    // Fail closed: an unreachable counter must not disable the limit.
    if (error || !data) {
      throw new Error(`rate_limit_hit failed: ${error?.message ?? "no data"}`);
    }

    return { count: data.count, resetAt: new Date(data.reset_at).getTime() };
  },
};
