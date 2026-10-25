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
  | { to: string; type: "activation"; accountType: AccountType; tokenHash: string }
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
    url.searchParams.set("next", homeFor(email.accountType));
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
