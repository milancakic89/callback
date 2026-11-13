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

import { sendAuthEmail, sendInterviewInvitationEmail, sendInterviewResponseEmail } from "./mail";

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

describe("the interview invitation email", () => {
  const invitation = {
    to: "ana@example.com",
    candidateName: "Ana Novak",
    companyName: "Acme",
    jobTitle: "Product Designer",
    when: "Tuesday, 15 January 2030, 11:00 (Europe/Belgrade)",
    duration: "45 minutes",
    deadline: "17 Jan, 11:00",
    message: "A short call.",
    url: "https://callback.rs/interviews/abc?t=token",
  };
  const sent = () => sendMail.mock.calls[0][0] as { to: string; subject: string; text: string; html: string };

  it("tells the candidate when, how long and by when to answer, with the link", async () => {
    await sendInterviewInvitationEmail(invitation);

    expect(sent().to).toBe("ana@example.com");
    expect(sent().subject).toBe("Interview invitation: Product Designer at Acme");
    for (const part of [invitation.when, "45 minutes", "17 Jan, 11:00", "A short call.", invitation.url]) {
      expect(sent().text, part).toContain(part);
      expect(sent().html, part).toContain(part.replaceAll("&", "&amp;"));
    }
    // The Meet link itself only comes once they confirm.
    expect(sent().text).not.toContain("meet.google.com");
  });

  it("leaves out the message when there is none", async () => {
    await sendInterviewInvitationEmail({ ...invitation, message: null });

    expect(sent().text).not.toContain("A message from");
  });

  it("escapes what users typed, in the page and in the button", async () => {
    await sendInterviewInvitationEmail({
      ...invitation,
      companyName: "Acme <b>&</b>",
      jobTitle: "<script>alert(1)</script>",
      candidateName: '"><img src=x>',
      message: "<a href=evil>click</a>",
      url: "https://callback.rs/interviews/abc?t=a&b=\"c\"",
    });

    const { html } = sent();
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<a href=evil");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="https://callback.rs/interviews/abc?t=a&amp;b=&quot;c&quot;"');
  });
});

describe("the interview response email", () => {
  const response = {
    to: "boss@acme.example",
    candidateName: "Ana Novak",
    jobTitle: "Product Designer",
    response: "confirmed" as const,
    when: "Tuesday, 15 January 2030, 11:00 (Europe/Belgrade)",
    meetUrl: "https://meet.google.com/abc-defg-hij",
    calendarInviteFailed: false,
    reviewUrl: "https://callback.rs/acme/jobs/job-1/review?candidate=app-1",
  };
  const sent = () => sendMail.mock.calls[0][0] as { subject: string; text: string };

  it("tells the company who confirmed, when, and where to meet", async () => {
    await sendInterviewResponseEmail(response);

    expect(sent().subject).toBe("Ana Novak confirmed the interview for Product Designer");
    expect(sent().text).toContain(response.when);
    expect(sent().text).toContain("https://meet.google.com/abc-defg-hij");
    expect(sent().text).toContain(response.reviewUrl);
    expect(sent().text).not.toContain("send them the Meet link yourself");
  });

  it("asks the company to send the link when Google could not invite the candidate", async () => {
    await sendInterviewResponseEmail({ ...response, calendarInviteFailed: true });

    expect(sent().text).toContain("send them the Meet link yourself");
  });

  it("tells the company who declined, with no Meet link", async () => {
    await sendInterviewResponseEmail({ ...response, response: "declined" });

    expect(sent().subject).toBe("Ana Novak declined the interview for Product Designer");
    expect(sent().text).not.toContain("meet.google.com");
  });
});
