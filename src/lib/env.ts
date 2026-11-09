import "server-only";
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
  // Public origin of the app, used to build links in emails (no trailing slash).
  APP_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),
  MAIL_FROM: z.string().min(1),
  // Encrypts the cookie that lets a not-yet-activated user pick an account type
  // (src/lib/auth/pending-signup.ts).
  AUTH_COOKIE_SECRET: z.string().min(32),
  // The private Cloudflare R2 bucket for applications' CVs and cover letters
  // (features/document-storage.md). Required: a release without them answers 500 on /api/health, and
  // the deploy rolls back. The endpoint is the bucket's own, https://<account-id>.eu.r2.cloudflarestorage.com
  // for the EU jurisdiction.
  R2_ENDPOINT: z.url().transform((url) => url.replace(/\/+$/, "")),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  // Shared with the scraper, which calls POST /api/jobs/revalidate after writing jobs. Optional:
  // without it that route is disabled and the job list refreshes on its cacheLife instead.
  REVALIDATE_SECRET: z.string().min(32).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables (see .env.example):\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
