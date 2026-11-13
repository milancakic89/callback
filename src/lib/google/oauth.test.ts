import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAuthUrl, emailFromIdToken, exchangeCode, GoogleAuthError, refreshAccessToken, revokeToken } from "./oauth";

const client = { clientId: "client-id", clientSecret: "client-secret" };
const REDIRECT = "https://callback.rs/api/google/callback";

const idToken = (payload: object) => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

function stubFetch(response: { ok: boolean; status?: number; body?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    json: async () => response.body ?? {},
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The form fields sent to Google.
const sentForm = (fetchMock: ReturnType<typeof vi.fn>) => Object.fromEntries(fetchMock.mock.calls[0][1].body as URLSearchParams);

afterEach(() => vi.unstubAllGlobals());

describe("buildAuthUrl", () => {
  it("asks for offline access with consent, the least scopes, and carries the state", () => {
    const url = new URL(buildAuthUrl({ clientId: "client-id", redirectUri: REDIRECT, state: "abc" }));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.events",
    ]);
  });
});

describe("emailFromIdToken", () => {
  it("reads the email claim", () => {
    expect(emailFromIdToken(idToken({ email: "boss@acme.example" }))).toBe("boss@acme.example");
  });

  it("answers null for anything else", () => {
    expect(emailFromIdToken(idToken({ sub: "1" }))).toBeNull();
    expect(emailFromIdToken("nope")).toBeNull();
    expect(emailFromIdToken("")).toBeNull();
  });
});

describe("exchangeCode", () => {
  it("trades the code for the tokens and the account's email", async () => {
    const fetchMock = stubFetch({
      ok: true,
      body: { refresh_token: "refresh", access_token: "access", id_token: idToken({ email: "boss@acme.example" }) },
    });

    expect(await exchangeCode(client, REDIRECT, "the-code")).toEqual({
      refreshToken: "refresh",
      accessToken: "access",
      email: "boss@acme.example",
    });
    expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
    expect(sentForm(fetchMock)).toEqual({
      code: "the-code",
      client_id: "client-id",
      client_secret: "client-secret",
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    });
  });

  it("fails when Google refuses, and when it gives no refresh token", async () => {
    stubFetch({ ok: false, status: 400 });
    await expect(exchangeCode(client, REDIRECT, "x")).rejects.toThrow("Google token exchange failed (400)");

    stubFetch({ ok: true, body: { access_token: "access", id_token: idToken({ email: "a@b.example" }) } });
    await expect(exchangeCode(client, REDIRECT, "x")).rejects.toThrow("refresh token");
  });
});

describe("refreshAccessToken", () => {
  it("answers a new access token", async () => {
    const fetchMock = stubFetch({ ok: true, body: { access_token: "fresh" } });

    expect(await refreshAccessToken(client, "refresh")).toBe("fresh");
    expect(sentForm(fetchMock)).toMatchObject({ refresh_token: "refresh", grant_type: "refresh_token" });
  });

  it("tells a revoked token from a failed request", async () => {
    stubFetch({ ok: false, status: 400, body: { error: "invalid_grant" } });
    await expect(refreshAccessToken(client, "refresh")).rejects.toBeInstanceOf(GoogleAuthError);

    stubFetch({ ok: false, status: 503, body: { error: "backend_error" } });
    const failure = refreshAccessToken(client, "refresh");
    await expect(failure).rejects.toThrow("Google token refresh failed (503)");
    await expect(failure).rejects.not.toBeInstanceOf(GoogleAuthError);
  });
});

describe("revokeToken", () => {
  it("asks Google to forget the token, and never fails", async () => {
    const fetchMock = stubFetch({ ok: true });
    await revokeToken("refresh");
    expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/revoke");
    expect(sentForm(fetchMock)).toEqual({ token: "refresh" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(revokeToken("refresh")).resolves.toBeUndefined();
  });
});
