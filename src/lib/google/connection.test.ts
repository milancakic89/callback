import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  read: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  deleteEq: vi.fn(),
  refreshAccessToken: vi.fn(),
  revokeToken: vi.fn(),
  userSelect: vi.fn(),
  // The real class is in oauth.ts; the connection module only needs `instanceof` to work on it.
  GoogleAuthError: class extends Error {},
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: m.env }));
vi.mock("./oauth", () => ({
  refreshAccessToken: m.refreshAccessToken,
  revokeToken: m.revokeToken,
  GoogleAuthError: m.GoogleAuthError,
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: m.read }) }),
      upsert: m.upsert,
      update: (values: unknown) => {
        m.update(values);
        return { eq: m.updateEq };
      },
      delete: () => ({ eq: m.deleteEq }),
    }),
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ maybeSingle: m.userSelect }) }) }),
}));

import {
  accessTokenFor,
  deleteGoogleConnection,
  getGoogleStatus,
  googleRedirectUri,
  googleSettings,
  GoogleUnavailableError,
  ownCompanyId,
  saveGoogleConnection,
} from "./connection";
import { openToken, sealToken } from "./seal";

const KEY = "k".repeat(40);
const sealed = sealToken("1//refresh", KEY);

function configure(on = true) {
  m.env.APP_URL = "https://callback.rs";
  m.env.GOOGLE_CLIENT_ID = on ? "client-id" : undefined;
  m.env.GOOGLE_CLIENT_SECRET = on ? "client-secret" : undefined;
  m.env.GOOGLE_TOKEN_KEY = on ? KEY : undefined;
}

const connection = (fields: Record<string, unknown> = {}) => ({
  data: { google_email: "boss@acme.example", refresh_token_ciphertext: sealed, broken_at: null, ...fields },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  configure();
  m.read.mockResolvedValue(connection());
  m.upsert.mockResolvedValue({ error: null });
  m.updateEq.mockResolvedValue({ error: null });
  m.deleteEq.mockResolvedValue({ error: null });
  m.refreshAccessToken.mockResolvedValue("access-token");
  m.revokeToken.mockResolvedValue(undefined);
});

describe("googleSettings", () => {
  it("is there when the client and the key are", () => {
    expect(googleSettings()).toEqual({ client: { clientId: "client-id", clientSecret: "client-secret" }, tokenKey: KEY });
  });

  it("is null when any of the three is missing", () => {
    for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_TOKEN_KEY"]) {
      configure();
      m.env[name] = undefined;
      expect(googleSettings(), name).toBeNull();
    }
  });
});

describe("googleRedirectUri", () => {
  it("is on the public address", () => {
    expect(googleRedirectUri()).toBe("https://callback.rs/api/google/callback");
  });
});

describe("ownCompanyId", () => {
  it("reads the caller's own company through their own client", async () => {
    m.userSelect.mockResolvedValue({ data: { id: "company-1" }, error: null });
    expect(await ownCompanyId()).toBe("company-1");

    m.userSelect.mockResolvedValue({ data: null, error: null });
    expect(await ownCompanyId()).toBeNull();
  });

  it("fails loudly when the database does", async () => {
    m.userSelect.mockResolvedValue({ data: null, error: { message: "db down" } });
    await expect(ownCompanyId()).rejects.toThrow("db down");
  });
});

describe("getGoogleStatus", () => {
  it("says Google isn't set up without asking the database", async () => {
    configure(false);
    expect(await getGoogleStatus("company-1")).toEqual({ configured: false, connected: false, email: null, broken: false });
    expect(m.read).not.toHaveBeenCalled();
  });

  it("says not connected, connected, and connected but broken", async () => {
    m.read.mockResolvedValue({ data: null, error: null });
    expect(await getGoogleStatus("company-1")).toEqual({ configured: true, connected: false, email: null, broken: false });

    m.read.mockResolvedValue(connection());
    expect(await getGoogleStatus("company-1")).toEqual({ configured: true, connected: true, email: "boss@acme.example", broken: false });

    m.read.mockResolvedValue(connection({ broken_at: "2030-01-01T00:00:00.000Z" }));
    expect(await getGoogleStatus("company-1")).toEqual({ configured: true, connected: true, email: "boss@acme.example", broken: true });
  });

  it("never gives the token", async () => {
    expect(JSON.stringify(await getGoogleStatus("company-1"))).not.toContain(sealed);
  });
});

describe("saveGoogleConnection", () => {
  it("keeps the refresh token encrypted, and clears a broken mark", async () => {
    await saveGoogleConnection({ companyId: "company-1", userId: "user-1", email: "boss@acme.example", refreshToken: "1//new" });

    const saved = m.upsert.mock.calls[0][0];
    expect(saved).toMatchObject({ company_id: "company-1", google_email: "boss@acme.example", connected_by: "user-1", broken_at: null });
    expect(JSON.stringify(saved)).not.toContain("1//new");
    expect(openToken(saved.refresh_token_ciphertext, KEY)).toBe("1//new");
  });

  it("refuses when Google isn't set up, and fails loudly when the database does", async () => {
    configure(false);
    await expect(saveGoogleConnection({ companyId: "c", userId: "u", email: "e", refreshToken: "t" })).rejects.toThrow("not set up");

    configure();
    m.upsert.mockResolvedValue({ error: { message: "db down" } });
    await expect(saveGoogleConnection({ companyId: "c", userId: "u", email: "e", refreshToken: "t" })).rejects.toThrow("db down");
  });
});

describe("deleteGoogleConnection", () => {
  it("asks Google to forget the token, then deletes the row", async () => {
    await deleteGoogleConnection("company-1");

    expect(m.revokeToken).toHaveBeenCalledWith("1//refresh");
    expect(m.deleteEq).toHaveBeenCalledWith("company_id", "company-1");
  });

  it("deletes the row even with nothing to revoke", async () => {
    m.read.mockResolvedValue({ data: null, error: null });

    await deleteGoogleConnection("company-1");
    expect(m.revokeToken).not.toHaveBeenCalled();
    expect(m.deleteEq).toHaveBeenCalled();
  });
});

describe("accessTokenFor", () => {
  const unavailable = async (reason: string) => {
    const error = await accessTokenFor("company-1").catch((caught) => caught);
    expect(error).toBeInstanceOf(GoogleUnavailableError);
    expect(error.reason).toBe(reason);
  };

  it("gives a fresh access token", async () => {
    expect(await accessTokenFor("company-1")).toBe("access-token");
    expect(m.refreshAccessToken).toHaveBeenCalledWith({ clientId: "client-id", clientSecret: "client-secret" }, "1//refresh");
  });

  it("says why there is none: not set up, not connected, broken, or unreadable", async () => {
    configure(false);
    await unavailable("not_configured");

    configure();
    m.read.mockResolvedValue({ data: null, error: null });
    await unavailable("not_connected");

    m.read.mockResolvedValue(connection({ broken_at: "2030-01-01T00:00:00.000Z" }));
    await unavailable("broken");
    expect(m.refreshAccessToken).not.toHaveBeenCalled();

    m.read.mockResolvedValue(connection({ refresh_token_ciphertext: "garbage" }));
    await unavailable("broken");
  });

  it("marks the connection broken when Google refuses the token", async () => {
    m.refreshAccessToken.mockRejectedValue(new m.GoogleAuthError());

    await unavailable("broken");
    expect(m.update).toHaveBeenCalledWith({ broken_at: expect.any(String) });
    expect(m.updateEq).toHaveBeenCalledWith("company_id", "company-1");
  });

  it("does not mark it broken for a failure that may pass", async () => {
    m.refreshAccessToken.mockRejectedValue(new Error("Google token refresh failed (503)"));

    await expect(accessTokenFor("company-1")).rejects.toThrow("503");
    expect(m.update).not.toHaveBeenCalled();
  });
});
