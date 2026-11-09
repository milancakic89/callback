import { UploadIcon } from "lucide-react";
import Link from "next/link";
import { CompanyAbout, CompanyAboutPlaceholder } from "@/components/company/company-about";
import { WorkModeBadge } from "@/components/jobs/work-mode-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasCompanyDetails, type CompanyProfile } from "@/lib/companies/profile";
import type { WorkMode } from "@/lib/jobs/types";

// The posting as a candidate will see it, next to the job form (features/companies.md), followed by
// the "About" card the company's profile gives every one of its jobs (features/company-profile.md).
// The Upload CV button belongs to the candidate's view, so it does nothing here.
export function JobPreview({
  title,
  description,
  location,
  workMode,
  companyName,
  companyProfile,
  profileEditHref,
}: {
  title: string;
  description: string;
  location: string;
  workMode: WorkMode | null;
  companyName: string;
  companyProfile: CompanyProfile | null;
  // Where the employer writes the company profile, offered while it is still empty.
  profileEditHref: string;
}) {
  return (
    <div className="grid gap-4">
      <Card aria-label="Candidate preview">
        <CardHeader className="border-b">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Candidate preview
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1">
            <CardTitle className={title.trim() ? "text-xl" : "text-xl text-muted-foreground"}>
              {title.trim() || "Job title"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{companyName}</p>
            {(location.trim() || workMode) && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {location.trim() && <span className="wrap-anywhere">{location.trim()}</span>}
                {workMode && <WorkModeBadge workMode={workMode} />}
              </div>
            )}
          </div>
          {/* Plain text, never HTML: the description is whatever the employer typed. */}
          <p className="min-h-24 text-sm whitespace-pre-wrap wrap-anywhere">
            {description.trim() || <span className="text-muted-foreground">The description appears here.</span>}
          </p>
          <div className="grid gap-2">
            <Button type="button" size="lg" className="w-full sm:w-fit">
              <UploadIcon aria-hidden /> Upload CV
            </Button>
            <p className="text-xs text-muted-foreground">Preview: candidates will upload their CV here.</p>
          </div>
        </CardContent>
      </Card>

      {companyProfile && hasCompanyDetails(companyProfile) ? (
        <CompanyAbout profile={companyProfile} />
      ) : (
        <CompanyAboutPlaceholder>
          Candidates will see your company description here.{" "}
          <Link
            href={profileEditHref}
            className="rounded-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Write your company profile
          </Link>
        </CompanyAboutPlaceholder>
      )}
    </div>
  );
}
