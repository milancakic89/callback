import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Reset password | Callback" };

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Set a new password"
      description="Choose a new password for your account."
      footerLinkLabel="Back to sign in"
      footerLinkHref="/sign-in"
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
