import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyOtp } = vi.hoisted(() => ({ verifyOtp: vi.fn() }));

vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://callback.rs" } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { verifyOtp } }) }));

import { GET } from "./route";

// Behind the reverse proxy the Node server only knows it listens on localhost:3000, and that is what
// `request.url` says. A redirect built from it sends the browser to localhost after the email link
// has been clicked, so the route has to use the public address from APP_URL.
const request = (query: string) => new NextRequest(`https://localhost:3000/auth/confirm?${query}`);
const locationOf = async (query: string) => (await GET(request(query))).headers.get("location");

function confirms(accountType?: string) {
  verifyOtp.mockResolvedValue({ data: { user: { app_metadata: { account_type: accountType } } }, error: null });
}

beforeEach(() => {
  verifyOtp.mockReset();
});

describe("a confirmed email link", () => {
  it("lands on the public address, never on the address the server listens on", async () => {
    confirms("candidate");
    const location = await locationOf("token_hash=abc&type=email");
    expect(location).toBe("https://callback.rs/dashboard");
    expect(location).not.toContain("localhost");
  });

  it("sends each account type to its own home", async () => {
    confirms("employer");
    expect(await locationOf("token_hash=abc&type=email")).toBe("https://callback.rs/test");
    confirms("candidate");
    expect(await locationOf("token_hash=abc&type=email")).toBe("https://callback.rs/dashboard");
    confirms(undefined);
    expect(await locationOf("token_hash=abc&type=email")).toBe("https://callback.rs/dashboard");
  });

  it("follows `next` when it is a path on this site", async () => {
    confirms("candidate");
    expect(await locationOf("token_hash=abc&type=recovery&next=%2Freset-password")).toBe("https://callback.rs/reset-password");
  });

  it("ignores a `next` that points at another site", async () => {
    confirms("candidate");
    for (const next of ["//evil.example", "/\\evil.example", "https://evil.example", "evil.example"]) {
      const location = await locationOf(`token_hash=abc&type=email&next=${encodeURIComponent(next)}`);
      expect(location, next).toBe("https://callback.rs/dashboard");
    }
  });

  it("verifies the token it was given", async () => {
    confirms("candidate");
    await locationOf("token_hash=abc123&type=recovery");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc123", type: "recovery" });
  });
});

describe("a link that doesn't work", () => {
  it("goes to sign-in on the public address when the token is refused", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    const location = await locationOf("token_hash=abc&type=email");
    expect(location).toBe("https://callback.rs/sign-in?error=invalid_link");
    expect(location).not.toContain("localhost");
  });

  it("goes there too, without asking Supabase, when the link is malformed", async () => {
    for (const query of ["", "token_hash=abc", "type=email", "token_hash=&type=email", "token_hash=abc&type=magic"]) {
      expect(await locationOf(query), query).toBe("https://callback.rs/sign-in?error=invalid_link");
    }
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
