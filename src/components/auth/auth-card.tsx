import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  footerLinkLabel: string;
  footerLinkHref: string;
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
      <CardFooter className="justify-center gap-1 text-base text-muted-foreground">
        {footerText}
        <Link
          href={footerLinkHref}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {footerLinkLabel}
        </Link>
      </CardFooter>
    </Card>
  );
}
