import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in | Job Manager" };

export default function SignInPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to manage your job search."
      footerText="Don't have an account?"
      footerLinkLabel="Sign up"
      footerLinkHref="/sign-up"
    >
      {/* SignInForm reads ?error= via useSearchParams; the boundary keeps the page shell static. */}
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
