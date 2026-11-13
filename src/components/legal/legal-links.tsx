import type { PropsWithChildren } from "react";

// How an e-mail address and an outside link look in the legal texts (features/legal-pages.md), written
// once so every mention is the same.

export function ContactLink({ email }: { email: string }) {
  return <a href={`mailto:${email}`}>{email}</a>;
}

// Opens in a new tab and can't reach back into this page (`noopener`), and sends no referrer.
export function ExternalLink({ href, children }: PropsWithChildren<{ href: string }>) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
