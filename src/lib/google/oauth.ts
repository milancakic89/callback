// Google's OAuth for the company's calendar (features/interview-invitations.md), with plain `fetch`
// instead of the googleapis package. No `server-only` and no environment: the callers pass the client
// settings in, so it can be tested with a stubbed fetch.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

// The least that does the job: events in the calendars the account can edit (the primary one is
// used), and the account's email, so settings can show which account is connected.
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"] as const;

// The cookie that holds the OAuth `state` between /api/google/connect and /api/google/callback.
export const GOOGLE_STATE_COOKIE = "cb_google_state";

export type GoogleClient = { clientId: string; clientSecret: string };

// Google refused the refresh token: it was revoked, or the account's consent ended. The company has to
// connect again.
export class GoogleAuthError extends Error {
  constructor(message = "Google refused the saved connection") {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export function buildAuthUrl({ clientId, redirectUri, state }: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  // offline gives a refresh token; consent makes Google give one every time, not only the first.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function postForm(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
}

// The email in an id_token. The token comes straight from Google's token endpoint over TLS, which is
// what OpenID Connect allows relying on without checking the signature.
export function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export type GoogleTokens = { refreshToken: string; accessToken: string; email: string };

export async function exchangeCode(client: GoogleClient, redirectUri: string, code: string): Promise<GoogleTokens> {
  const response = await postForm(TOKEN_URL, {
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);

  const data = (await response.json()) as { refresh_token?: string; access_token?: string; id_token?: string };
  const email = data.id_token ? emailFromIdToken(data.id_token) : null;
  if (!data.refresh_token || !data.access_token || !email) {
    throw new Error("Google did not give a refresh token and an email");
  }
  return { refreshToken: data.refresh_token, accessToken: data.access_token, email };
}

// A short-lived access token from the saved refresh token. `invalid_grant` is the token being revoked
// or expired, which is not a failure of the request: GoogleAuthError.
export async function refreshAccessToken(client: GoogleClient, refreshToken: string): Promise<string> {
  const response = await postForm(TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    grant_type: "refresh_token",
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (data.error === "invalid_grant") throw new GoogleAuthError();
    throw new Error(`Google token refresh failed (${response.status})`);
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google did not give an access token");
  return data.access_token;
}

// Best effort: if it fails the token still stops working when the company removes the app from its
// Google account, and the row is deleted either way.
export async function revokeToken(token: string): Promise<void> {
  await postForm(REVOKE_URL, { token }).catch(() => undefined);
}
