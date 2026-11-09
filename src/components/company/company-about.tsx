import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { companyFacts, type CompanyProfile } from "@/lib/companies/profile";

// "About {company}" (features/company-profile.md): what the company does and a few facts about it.
// It is the same card on a job's page, on the company's own page, and in the employer's previews, so
// a company sees there exactly what candidates will. Server-safe (no hooks). `children` is for what
// goes under the text, such as a link to the company's page.
export function CompanyAbout({ profile, children }: { profile: CompanyProfile; children?: ReactNode }) {
  const facts = companyFacts(profile);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg wrap-anywhere">About {profile.name}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {facts.length > 0 && (
          <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {facts.map((fact) => (
              <div key={fact.label} className="grid gap-0.5">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{fact.label}</dt>
                <dd className="wrap-anywhere">
                  {fact.href ? (
                    <a
                      href={fact.href}
                      target="_blank"
                      // The address is whatever the company typed, so a visitor leaving through it
                      // must not hand over the opener, and the link must not pass on ranking.
                      rel="noopener noreferrer nofollow ugc"
                      className="rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {fact.value}
                    </a>
                  ) : (
                    fact.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {/* Plain text, never HTML: the description is whatever the company typed. */}
        {profile.description && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">{profile.description}</p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

// What an employer's preview shows in place of the card while the profile is still empty.
export function CompanyAboutPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">{children}</div>
  );
}
