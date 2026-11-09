import Link from "next/link";
import { Suspense } from "react";
import { KeepNextLink } from "@/components/auth/keep-next-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FOOTER_LINK = "font-medium text-foreground underline-offset-4 hover:underline";

export function AuthCard({
  title,
  description,
  footerText,
  footerLinkLabel,
  footerLinkHref,
  children,
}: {
  title: string;
  description: string;
  footerText?: string;
  footerLinkLabel?: string;
  footerLinkHref?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-3xl shadow-md [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(8)]">
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>
      <CardContent className="[&_[data-slot=button]]:h-11 [&_[data-slot=button]]:text-base [&_[data-slot=input]]:h-11 [&_[data-slot=input]]:text-base [&_form]:gap-6 [&_label]:text-base">
        {children}
      </CardContent>
      {footerLinkLabel && footerLinkHref && (
        <CardFooter className="justify-center gap-1 text-base text-muted-foreground">
          {footerText}
          {/* Between sign-in and sign-up, a posting to come back to goes along (features/candidate-cvs.md). */}
          <Suspense
            fallback={
              <Link href={footerLinkHref} className={FOOTER_LINK}>
                {footerLinkLabel}
              </Link>
            }
          >
            <KeepNextLink href={footerLinkHref} className={FOOTER_LINK}>
              {footerLinkLabel}
            </KeepNextLink>
          </Suspense>
        </CardFooter>
      )}
    </Card>
  );
}
