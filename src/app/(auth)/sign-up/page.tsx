import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Sign up | Callback" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Find your next job or hire your next teammate."
      footerText="Already have an account?"
      footerLinkLabel="Sign in"
      footerLinkHref="/sign-in"
    >
      <SignUpForm />
    </AuthCard>
  );
}
