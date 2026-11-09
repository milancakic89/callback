import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));
vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "https://callback.rs",
    MAIL_FROM: "Callback <hello@callback.rs>",
    SMTP_HOST: "smtp.example",
    SMTP_PORT: 587,
    SMTP_USER: "u",
    SMTP_PASSWORD: "p",
  },
}));

import { sendAuthEmail } from "./mail";

const POSTING = "/jobs/7c9e6679-7425-40de-944b-e07fc1f90ae7?apply=1";

// The link in the plain-text body, read back as a URL.
function sentLink(): URL {
  const { text } = sendMail.mock.calls[0][0] as { text: string };
  return new URL(text.match(/https:\/\/\S+/)![0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMail.mockResolvedValue(undefined);
});

describe("the activation email", () => {
  it("lands on the account's home without a posting", async () => {
    await sendAuthEmail({ to: "ana@example.com", type: "activation", accountType: "candidate", tokenHash: "abc" });

    const link = sentLink();
    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("token_hash")).toBe("abc");
    expect(link.searchParams.get("type")).toBe("email");
    expect(link.searchParams.get("next")).toBe("/dashboard");
  });

  it("lands on the posting a candidate signed up from, with the apply dialog open", async () => {
    await sendAuthEmail({ to: "ana@example.com", type: "activation", accountType: "candidate", tokenHash: "abc", next: POSTING });

    expect(sentLink().searchParams.get("next")).toBe(POSTING);
    const { html } = sendMail.mock.calls[0][0] as { html: string };
    // The link's own "&" are escaped in the HTML, so the query reads the same there.
    expect(html).not.toMatch(/&(?!amp;)/);
  });

  it("sends an employer to the setup screen", async () => {
    await sendAuthEmail({ to: "boss@acme.example", type: "activation", accountType: "employer", tokenHash: "abc" });
    expect(sentLink().searchParams.get("next")).toBe("/setup");
  });
});
