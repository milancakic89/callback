import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  googleSettings: vi.fn(),
  ownCompanyId: vi.fn(),
  saveGoogleConnection: vi.fn(),
  exchangeCode: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://callback.rs" } }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock("@/lib/google/connection", () => ({
  googleSettings: m.googleSettings,
  googleRedirectUri: () => "https://callback.rs/api/google/callback",
  ownCompanyId: m.ownCompanyId,
  saveGoogleConnection: m.saveGoogleConnection,
}));
vi.mock("@/lib/google/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/oauth")>()),
  exchangeCode: m.exchangeCode,
}));

import { GET } from "./route";

const STATE = "state-value-0123456789abcdef0123456789";

// Behind the reverse proxy `request.url` says localhost; the redirect must still be to the public address.
// `cookie` is null for a browser that has no state cookie (undefined would take the default).
function callback(query: string, cookie: string | null = STATE) {
  return GET(
    new NextRequest(`https://localhost:3000/api/google/callback?${query}`, {
      headers: cookie === null ? {} : { cookie: `cb_google_state=${cookie}` },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getCurrentUser.mockResolvedValue({ id: "user-1", accountType: "employer", companySlug: "acme" });
  m.googleSettings.mockReturnValue({ client: { clientId: "client-id", clientSecret: "secret" }, tokenKey: "k".repeat(40) });
  m.ownCompanyId.mockResolvedValue("company-1");
  m.exchangeCode.mockResolvedValue({ refreshToken: "1//refresh", accessToken: "access", email: "boss@acme.example" });
  m.saveGoogleConnection.mockResolvedValue(undefined);
});

describe("GET /api/google/callback", () => {
  it("saves the connection for the signed-in employer's own company and goes back to the settings", async () => {
    const response = await callback(`code=the-code&state=${STATE}`);

    expect(response.headers.get("location")).toBe("https://callback.rs/acme/settings?google=connected");
    expect(m.exchangeCode).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client-id" }), "https://callback.rs/api/google/callback", "the-code");
    expect(m.saveGoogleConnection).toHaveBeenCalledExactlyOnceWith({
      companyId: "company-1",
      userId: "user-1",
      email: "boss@acme.example",
      refreshToken: "1//refresh",
    });
    expect(response.cookies.get("cb_google_state")?.value).toBe("");
  });

  it("refuses a state that doesn't match the cookie, or has no cookie", async () => {
    for (const [query, cookie] of [
      ["code=x&state=other-state", STATE],
      [`code=x&state=${STATE}`, null],
      ["code=x", STATE],
      [`code=x&state=${STATE}x`, STATE],
    ] as const) {
      const response = await callback(query, cookie);
      expect(response.headers.get("location"), query).toBe("https://callback.rs/acme/settings?google=error");
    }
    expect(m.exchangeCode).not.toHaveBeenCalled();
    expect(m.saveGoogleConnection).not.toHaveBeenCalled();
  });

  it("says so when the employer said no on Google's screen", async () => {
    const response = await callback(`error=access_denied&state=${STATE}`);

    expect(response.headers.get("location")).toBe("https://callback.rs/acme/settings?google=denied");
    expect(m.saveGoogleConnection).not.toHaveBeenCalled();
  });

  it("sends anyone but an employer with a company to sign in", async () => {
    for (const user of [null, { id: "u", accountType: "candidate", companySlug: null }, { id: "u", accountType: "employer", companySlug: null }]) {
      m.getCurrentUser.mockResolvedValue(user);
      expect((await callback(`code=x&state=${STATE}`)).headers.get("location")).toBe("https://callback.rs/sign-in");
    }
    expect(m.saveGoogleConnection).not.toHaveBeenCalled();
  });

  it("reports a failure without its detail", async () => {
    m.exchangeCode.mockRejectedValue(new Error("secret detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await callback(`code=x&state=${STATE}`);
    expect(response.headers.get("location")).toBe("https://callback.rs/acme/settings?google=error");
    expect(response.headers.get("location")).not.toContain("secret");
    log.mockRestore();
  });

  it("fails when there is no code, no company or no Google settings", async () => {
    expect((await callback(`state=${STATE}`)).headers.get("location")).toContain("google=error");

    m.ownCompanyId.mockResolvedValue(null);
    expect((await callback(`code=x&state=${STATE}`)).headers.get("location")).toContain("google=error");

    m.googleSettings.mockReturnValue(null);
    expect((await callback(`code=x&state=${STATE}`)).headers.get("location")).toContain("google=error");
    expect(m.saveGoogleConnection).not.toHaveBeenCalled();
  });
});
