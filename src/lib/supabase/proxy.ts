import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseAccountType } from "@/lib/auth/account-type";

// Runs in proxy, the only place that can persist a refreshed session: Server Components can't write cookies.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Verifies the JWT locally; only calls Supabase when the access token has expired and needs a refresh.
  const { data } = await supabase.auth.getClaims();

  return {
    response,
    isAuthenticated: Boolean(data?.claims),
    // From app_metadata, which only the secret-key client can change (features/account-types.md).
    accountType: parseAccountType(data?.claims?.app_metadata?.account_type),
  };
}
