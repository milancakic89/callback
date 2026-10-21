import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password | Job Manager" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your email and we'll send you a link to reset it."
      footerText="Remembered it?"
      footerLinkLabel="Back to sign in"
      footerLinkHref="/sign-in"
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
