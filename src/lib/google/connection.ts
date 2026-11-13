import "server-only";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { GoogleStatus } from "@/lib/interviews/types";
import { GoogleAuthError, refreshAccessToken, revokeToken, type GoogleClient } from "./oauth";
import { openToken, sealToken } from "./seal";

// A company's connection to its Google Calendar (features/interview-invitations.md). The row is in
// google_calendar_connections, which only the secret-key client can reach, so every function here is
// told which company it is for: the callers get the id from ownCompanyId() (the signed-in employer's
// own, through row level security) or from an invitation they have already checked.

// The Google settings, or null while the server has none (they are optional in the environment).
export function googleSettings(): { client: GoogleClient; tokenKey: string } | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_TOKEN_KEY) return null;
  return {
    client: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    tokenKey: env.GOOGLE_TOKEN_KEY,
  };
}

// The address Google sends the company back to. It is what is registered in the Google Cloud Console.
export function googleRedirectUri(): string {
  return `${env.APP_URL}/api/google/callback`;
}

// The signed-in employer's own company, or null. Read with their own client: row level security shows an
// owner nothing but their company.
export async function ownCompanyId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").select("id").maybeSingle<{ id: string }>();
  if (error) throw new Error(`ownCompanyId: ${error.message}`);
  return data?.id ?? null;
}

type ConnectionRow = { google_email: string; refresh_token_ciphertext: string; broken_at: string | null };

async function readConnection(companyId: string): Promise<ConnectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("google_calendar_connections")
    .select("google_email, refresh_token_ciphertext, broken_at")
    .eq("company_id", companyId)
    .maybeSingle<ConnectionRow>();
  if (error) throw new Error(`readConnection: ${error.message}`);
  return data;
}

export async function getGoogleStatus(companyId: string): Promise<GoogleStatus> {
  if (!googleSettings()) return { configured: false, connected: false, email: null, broken: false };
  const row = await readConnection(companyId);
  if (!row) return { configured: true, connected: false, email: null, broken: false };
  return { configured: true, connected: true, email: row.google_email, broken: row.broken_at !== null };
}

export async function saveGoogleConnection({
  companyId,
  userId,
  email,
  refreshToken,
}: {
  companyId: string;
  userId: string;
  email: string;
  refreshToken: string;
}): Promise<void> {
  const settings = googleSettings();
  if (!settings) throw new Error("Google is not set up on this server");
  const { error } = await supabaseAdmin.from("google_calendar_connections").upsert({
    company_id: companyId,
    google_email: email,
    refresh_token_ciphertext: sealToken(refreshToken, settings.tokenKey),
    connected_by: userId,
    connected_at: new Date().toISOString(),
    broken_at: null,
  });
  if (error) throw new Error(`saveGoogleConnection: ${error.message}`);
}

// Disconnecting asks Google to forget the token (best effort) and deletes the row. Events already in
// the calendar stay there; the invitations that wait on an answer can no longer be changed in it.
export async function deleteGoogleConnection(companyId: string): Promise<void> {
  const settings = googleSettings();
  const row = await readConnection(companyId);
  if (row && settings) {
    const refreshToken = openToken(row.refresh_token_ciphertext, settings.tokenKey);
    if (refreshToken) await revokeToken(refreshToken);
  }
  const { error } = await supabaseAdmin.from("google_calendar_connections").delete().eq("company_id", companyId);
  if (error) throw new Error(`deleteGoogleConnection: ${error.message}`);
}

// Why the company's calendar can't be used right now. `message` is what the employer reads.
export class GoogleUnavailableError extends Error {
  constructor(
    readonly reason: "not_configured" | "not_connected" | "broken",
    message: string,
  ) {
    super(message);
    this.name = "GoogleUnavailableError";
  }
}

// A fresh access token for the company's calendar. Google refusing the saved token marks the connection
// broken, so settings shows "Reconnect" and nothing keeps trying.
export async function accessTokenFor(companyId: string): Promise<string> {
  const settings = googleSettings();
  if (!settings) throw new GoogleUnavailableError("not_configured", "Google Calendar isn't set up on this server.");

  const row = await readConnection(companyId);
  if (!row) throw new GoogleUnavailableError("not_connected", "Connect Google Calendar in Settings first.");
  if (row.broken_at) throw new GoogleUnavailableError("broken", "Google Calendar needs to be connected again, in Settings.");

  const refreshToken = openToken(row.refresh_token_ciphertext, settings.tokenKey);
  if (!refreshToken) throw new GoogleUnavailableError("broken", "Google Calendar needs to be connected again, in Settings.");

  try {
    return await refreshAccessToken(settings.client, refreshToken);
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      await supabaseAdmin
        .from("google_calendar_connections")
        .update({ broken_at: new Date().toISOString() })
        .eq("company_id", companyId);
      throw new GoogleUnavailableError("broken", "Google Calendar needs to be connected again, in Settings.");
    }
    throw error;
  }
}
