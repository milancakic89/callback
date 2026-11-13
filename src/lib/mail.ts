import "server-only";
import nodemailer from "nodemailer";
import { homeFor, type AccountType } from "@/lib/auth/account-type";
import { env } from "@/lib/env";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
});

// Activation is sent once the user has picked an account type (features/account-types.md). Its token
// comes from a magic link, which also confirms the email, so the link is verified as `type=email`.
type AuthEmail =
  // `next`: where the link lands once the account is active, instead of its home (a posting a
  // candidate signed up from, features/candidate-cvs.md). Checked by postingNext() before it gets here.
  | { to: string; type: "activation"; accountType: AccountType; tokenHash: string; next?: string | null }
  | { to: string; type: "recovery"; tokenHash: string };

const templates: Record<AuthEmail["type"], { subject: string; heading: string; body: string; cta: string }> = {
  activation: {
    subject: "Activate your Callback account",
    heading: "Activate your account",
    body: "Confirm your email address to activate your account.",
    cta: "Activate account",
  },
  recovery: {
    subject: "Reset your Callback password",
    heading: "Reset your password",
    body: "We received a request to reset your password. If it wasn't you, ignore this email.",
    cta: "Reset password",
  },
};

const ACTIVATION_BODY: Record<AccountType, string> = {
  candidate: "Confirm your email address to activate your account and start your job search.",
  employer: "Confirm your email address to activate your account and start hiring.",
};

function confirmUrl(email: AuthEmail) {
  const url = new URL("/auth/confirm", env.APP_URL);
  url.searchParams.set("token_hash", email.tokenHash);
  if (email.type === "activation") {
    url.searchParams.set("type", "email");
    // A new account has no company yet, so an employer lands on /setup (features/company-slugs.md).
    url.searchParams.set("next", email.next ?? homeFor(email.accountType, null));
  } else {
    url.searchParams.set("type", "recovery");
    url.searchParams.set("next", "/reset-password");
  }
  return url.toString();
}

// URL is built from our own origin and a URL-encoded token, so it needs no HTML escaping beyond "&".
export async function sendAuthEmail(email: AuthEmail) {
  const { subject, heading, cta } = templates[email.type];
  const body = email.type === "activation" ? ACTIVATION_BODY[email.accountType] : templates[email.type].body;
  const url = confirmUrl(email);
  const htmlUrl = url.replaceAll("&", "&amp;");

  await transporter.sendMail({
    from: env.MAIL_FROM,
    to: email.to,
    subject,
    text: `${heading}\n\n${body}\n\n${url}\n`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
<h2>${heading}</h2><p>${body}</p>
<p><a href="${htmlUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${cta}</a></p>
<p style="color:#666;font-size:12px">Or paste this link into your browser:<br>${htmlUrl}</p></div>`,
  });
}

// --- Interview invitations (features/interview-invitations.md) --------------------------------------

// Job titles, company names, candidate names and the company's message are typed by users, so they go
// into the HTML escaped. (The auth emails above only insert our own URL.)
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// The same layout as the auth emails: a heading, paragraphs, an optional button and its plain link.
async function sendLayoutEmail({
  to,
  subject,
  heading,
  paragraphs,
  action,
}: {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
}) {
  const htmlParagraphs = paragraphs.map((paragraph) => `<p style="white-space:pre-line">${escapeHtml(paragraph)}</p>`).join("\n");
  const htmlUrl = action ? escapeHtml(action.url) : "";
  const button = action
    ? `<p><a href="${htmlUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="color:#666;font-size:12px">Or paste this link into your browser:<br>${htmlUrl}</p>`
    : "";

  await transporter.sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text: [heading, ...paragraphs, ...(action ? [action.url] : [])].join("\n\n") + "\n",
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
<h2>${escapeHtml(heading)}</h2>
${htmlParagraphs}
${button}</div>`,
  });
}

export type InterviewInvitationEmail = {
  to: string;
  candidateName: string;
  companyName: string;
  jobTitle: string;
  // Already formatted in the company's time zone (src/lib/interviews/format.ts).
  when: string;
  duration: string;
  deadline: string;
  message: string | null;
  url: string;
};

export async function sendInterviewInvitationEmail(email: InterviewInvitationEmail) {
  await sendLayoutEmail({
    to: email.to,
    subject: `Interview invitation: ${email.jobTitle} at ${email.companyName}`,
    heading: "You're invited to an interview",
    paragraphs: [
      `Hi ${email.candidateName},`,
      `${email.companyName} would like to talk to you about ${email.jobTitle}.`,
      `When: ${email.when}\nLength: ${email.duration}\nWhere: Google Meet (the link comes once you confirm)`,
      ...(email.message ? [`A message from ${email.companyName}:\n${email.message}`] : []),
      `Please confirm or decline by ${email.deadline}. If we don't hear from you, the invitation closes.`,
    ],
    action: { label: "Respond to the invitation", url: email.url },
  });
}

export type InterviewResponseEmail = {
  to: string;
  candidateName: string;
  jobTitle: string;
  response: "confirmed" | "declined";
  when: string;
  meetUrl: string | null;
  // The candidate confirmed but Google could not add them to the event: the company sends the link.
  calendarInviteFailed: boolean;
  reviewUrl: string;
};

export async function sendInterviewResponseEmail(email: InterviewResponseEmail) {
  const confirmed = email.response === "confirmed";
  await sendLayoutEmail({
    to: email.to,
    subject: `${email.candidateName} ${confirmed ? "confirmed" : "declined"} the interview for ${email.jobTitle}`,
    heading: confirmed ? "Interview confirmed" : "Interview declined",
    paragraphs: [
      confirmed
        ? `${email.candidateName} confirmed the interview for ${email.jobTitle}.`
        : `${email.candidateName} declined the interview for ${email.jobTitle}. The event is gone from your calendar.`,
      `When: ${email.when}`,
      ...(confirmed && email.meetUrl ? [`Google Meet: ${email.meetUrl}`] : []),
      ...(confirmed && email.calendarInviteFailed
        ? ["Google could not send them a calendar invitation, so please send them the Meet link yourself."]
        : []),
    ],
    action: { label: "Open the review", url: email.reviewUrl },
  });
}
