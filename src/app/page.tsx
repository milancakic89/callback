import type { Metadata } from "next";
import { DarkSurface } from "@/components/dark-surface";
import { CandidateUpdates } from "@/components/landing/candidate-updates";
import { FastManual } from "@/components/landing/fast-manual";
import { FinalCta } from "@/components/landing/final-cta";
import { ForCandidates } from "@/components/landing/for-candidates";
import { ForEmployers } from "@/components/landing/for-employers";
import { Hero } from "@/components/landing/hero";
import { newestPerCompany } from "@/components/landing/newest-jobs";
import { Pricing } from "@/components/landing/pricing";
import { Problem } from "@/components/landing/problem";
import { Screening } from "@/components/landing/screening";
import { ScrollReveal } from "@/components/landing/scroll-reveal";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getActiveJobs } from "@/lib/jobs/queries";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: "Callback | Every application deserves a response",
  description:
    "Find your next role, apply with your CV and track every application. For employers: post jobs, receive CVs and cover letters, and review them side by side.",
  openGraph: {
    title: "Callback | Every application deserves a response",
    description: "Find your next opportunity. Review candidates faster. Make recruitment more transparent for everyone.",
    type: "website",
  },
};

const NUMBER = new Intl.NumberFormat("en-US");

// Landing page (features/landing.md). Signed-in visitors never see it: src/proxy.ts sends them to
// /dashboard. The only data is the cached public job list (tag "jobs"), so the whole page
// prerenders; just the count and six postings (those posted on Callback first, then the newest) reach
// the markup, never the full list.
export default async function LandingPage() {
  const jobs = await getActiveJobs();
  const openRoles = NUMBER.format(jobs.length);
  const newest = newestPerCompany(jobs, 6);

  return (
    <div data-landing className="flex flex-1 flex-col">
      <DarkSurface />
      <SiteNav />
      <main className="flex-1">
        <Hero openRoles={openRoles} />
        <Problem />
        <ForCandidates openRoles={openRoles} jobs={newest} />
        <ForEmployers />
        <FastManual />
        <Screening />
        <CandidateUpdates />
        <Pricing />
        <FinalCta openRoles={openRoles} />
      </main>
      <SiteFooter />
      <ScrollReveal />
    </div>
  );
}
