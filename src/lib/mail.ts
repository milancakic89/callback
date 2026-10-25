import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
});

type EmailType = "signup" | "recovery";

const templates: Record<EmailType, { subject: string; heading: string; body: string; cta: string }> = {
  signup: {
    subject: "Confirm your Callback account",
    heading: "Confirm your email",
    body: "Thanks for signing up. Confirm your email address to finish creating your account.",
    cta: "Confirm email",
  },
  recovery: {
    subject: "Reset your Callback password",
    heading: "Reset your password",
    body: "We received a request to reset your password. If it wasn't you, ignore this email.",
    cta: "Reset password",
  },
};

function confirmUrl(type: EmailType, tokenHash: string) {
  const url = new URL("/auth/confirm", env.APP_URL);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  if (type === "recovery") url.searchParams.set("next", "/reset-password");
  return url.toString();
}

// URL is built from our own origin and a URL-encoded token, so it needs no HTML escaping beyond "&".
export async function sendAuthEmail({
  to,
  type,
  tokenHash,
}: {
  to: string;
  type: EmailType;
  tokenHash: string;
}) {
  const { subject, heading, body, cta } = templates[type];
  const url = confirmUrl(type, tokenHash);
  const htmlUrl = url.replaceAll("&", "&amp;");

  await transporter.sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text: `${heading}\n\n${body}\n\n${url}\n`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
<h2>${heading}</h2><p>${body}</p>
<p><a href="${htmlUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${cta}</a></p>
<p style="color:#666;font-size:12px">Or paste this link into your browser:<br>${htmlUrl}</p></div>`,
  });
}
