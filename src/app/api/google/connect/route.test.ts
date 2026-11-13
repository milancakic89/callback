import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getCurrentUser: vi.fn(), googleSettings: vi.fn() }));

vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://callback.rs" } }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock("@/lib/google/connection", () => ({
  googleSettings: m.googleSettings,
  googleRedirectUri: () => "https://callback.rs/api/google/callback",
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  m.getCurrentUser.mockResolvedValue({ id: "user-1", accountType: "employer", companySlug: "acme" });
  m.googleSettings.mockReturnValue({ client: { clientId: "client-id", clientSecret: "secret" }, tokenKey: "k".repeat(40) });
});

describe("GET /api/google/connect", () => {
  it("sends the employer to Google with a state it keeps in a cookie", async () => {
    const response = await GET();

    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("redirect_uri")).toBe("https://callback.rs/api/google/callback");
    const state = location.searchParams.get("state")!;
    expect(state.length).toBeGreaterThanOrEqual(32);

    const cookie = response.cookies.get("cb_google_state");
    expect(cookie?.value).toBe(state);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/api/google", maxAge: 600 });
  });

  it("uses a new state each time", async () => {
    const first = (await GET()).cookies.get("cb_google_state")?.value;
    const second = (await GET()).cookies.get("cb_google_state")?.value;
    expect(first).not.toBe(second);
  });

  it("sends anyone but an employer with a company to sign in, on the public address", async () => {
    for (const user of [null, { id: "u", accountType: "candidate", companySlug: null }, { id: "u", accountType: "employer", companySlug: null }]) {
      m.getCurrentUser.mockResolvedValue(user);
      const response = await GET();
      expect(response.headers.get("location")).toBe("https://callback.rs/sign-in");
      expect(response.cookies.get("cb_google_state")).toBeUndefined();
    }
  });

  it("goes back to the settings when this server has no Google credentials", async () => {
    m.googleSettings.mockReturnValue(null);

    const response = await GET();
    expect(response.headers.get("location")).toBe("https://callback.rs/acme/settings?google=not_configured");
  });
});
