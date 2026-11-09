"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  saveCompanyProfile,
  type CompanyProfileFormState,
} from "@/app/(employer)/[company]/(workspace)/profile/actions";
import { FieldError, FormAlert } from "@/components/auth/form-feedback";
import { CompanyAbout, CompanyAboutPlaceholder } from "@/components/company/company-about";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COMPANY_SIZE_LABELS,
  COMPANY_SIZES,
  companyProfilePath,
  hasCompanyDetails,
  HEADQUARTERS_MAX,
  INDUSTRY_MAX,
  isCompanySize,
  previewProfile,
  PROFILE_DESCRIPTION_MAX,
  WEBSITE_MAX,
  type CompanyProfile,
} from "@/lib/companies/profile";

// Stands for "no size" in the select; the form submits it as an empty value.
const NO_SIZE = "none";
type SizeChoice = (typeof COMPANY_SIZES)[number] | typeof NO_SIZE;

function isSizeChoice(value: unknown): value is SizeChoice {
  return value === NO_SIZE || isCompanySize(value);
}

const initialState: CompanyProfileFormState = {};

// The company profile form (features/company-profile.md): the fields on the left, and on the right
// the "About" card as candidates will see it on every one of the company's jobs and on its own page.
// The values live in state, not only in the inputs: the preview reads them, and React resets an
// uncontrolled form after every action, which would wipe it when the server refuses a field (the same
// reason as src/components/employer/job-editor.tsx). After saving, the form stays on the page.
export function CompanyProfileEditor({
  company,
  profile,
}: {
  company: { name: string; slug: string };
  profile: CompanyProfile | null;
}) {
  const [state, formAction, pending] = useActionState(saveCompanyProfile, initialState);
  const [description, setDescription] = useState(profile?.description ?? "");
  const [website, setWebsite] = useState(profile?.website ?? "");
  const [industry, setIndustry] = useState(profile?.industry ?? "");
  const [size, setSize] = useState<SizeChoice>(profile?.size ?? NO_SIZE);
  const [headquarters, setHeadquarters] = useState(profile?.headquarters ?? "");

  const errors = state.fieldErrors;
  const preview = previewProfile(company, {
    description,
    website,
    industry,
    size: size === NO_SIZE ? null : size,
    headquarters,
  });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form action={formAction} className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
        <FormAlert state={state} />
        <div className="grid gap-2">
          <Label htmlFor="profile-description">What does {company.name} do?</Label>
          <Textarea
            id="profile-description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={PROFILE_DESCRIPTION_MAX}
            rows={10}
            placeholder="What the company does, who it serves, how the team works and what makes it a good place to work."
            aria-invalid={Boolean(errors?.description)}
            aria-describedby="profile-description-error profile-description-count"
          />
          <p id="profile-description-count" className="text-xs text-muted-foreground">
            {description.length.toLocaleString("en-US")} / {PROFILE_DESCRIPTION_MAX.toLocaleString("en-US")}
          </p>
          <FieldError id="profile-description-error" errors={errors?.description} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="profile-website">
            Website <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="profile-website"
            name="website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            maxLength={WEBSITE_MAX}
            placeholder="https://acme.com"
            inputMode="url"
            autoComplete="off"
            aria-invalid={Boolean(errors?.website)}
            aria-describedby="profile-website-error"
          />
          <FieldError id="profile-website-error" errors={errors?.website} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="profile-industry">
              Industry <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="profile-industry"
              name="industry"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              maxLength={INDUSTRY_MAX}
              placeholder="Healthcare software"
              autoComplete="off"
              aria-invalid={Boolean(errors?.industry)}
              aria-describedby="profile-industry-error"
            />
            <FieldError id="profile-industry-error" errors={errors?.industry} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="profile-size">
              Company size <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            {/* The select has no `name`: this input is what the form submits. */}
            <input type="hidden" name="size" value={size === NO_SIZE ? "" : size} />
            <Select
              value={size}
              onValueChange={(value) => {
                if (isSizeChoice(value)) setSize(value);
              }}
            >
              <SelectTrigger
                id="profile-size"
                className="w-full"
                aria-invalid={Boolean(errors?.size)}
                aria-describedby="profile-size-error"
              >
                {/* Base UI shows the raw value unless told how to render it. */}
                <SelectValue>
                  {(value: string) => (isCompanySize(value) ? COMPANY_SIZE_LABELS[value] : "Not specified")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value={NO_SIZE}>Not specified</SelectItem>
                {COMPANY_SIZES.map((companySize) => (
                  <SelectItem key={companySize} value={companySize}>
                    {COMPANY_SIZE_LABELS[companySize]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id="profile-size-error" errors={errors?.size} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="profile-headquarters">
            Headquarters <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="profile-headquarters"
            name="headquarters"
            value={headquarters}
            onChange={(event) => setHeadquarters(event.target.value)}
            maxLength={HEADQUARTERS_MAX}
            placeholder="Belgrade, Serbia"
            autoComplete="off"
            aria-invalid={Boolean(errors?.headquarters)}
            aria-describedby="profile-headquarters-error"
          />
          <FieldError id="profile-headquarters-error" errors={errors?.headquarters} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
          <Link href={`/${company.slug}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Back to dashboard
          </Link>
        </div>
      </form>

      <div className="grid gap-4" aria-label="Candidate preview">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Candidate preview</p>
        {hasCompanyDetails(preview) ? (
          <CompanyAbout profile={preview} />
        ) : (
          <CompanyAboutPlaceholder>Your company profile appears here as you type.</CompanyAboutPlaceholder>
        )}
        <Link
          href={companyProfilePath(company.slug)}
          className="w-fit rounded-sm text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          View your public company page
        </Link>
      </div>
    </div>
  );
}
