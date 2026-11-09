// Plan data for the landing page's pricing section (features/landing.md). For now there is a single
// Free plan: pricing isn't being built, so the Starter and Pro plans were taken out (their text is kept
// in features/landing.md). There is no checkout; an employer can already open an account, so the CTA
// goes to sign-up, where "I'm hiring" is one of the two choices.
//
// Adding a plan with a price brings back the Monthly / Yearly switch and the three-column layout by
// itself (PricingTable); the helpers below price it.

export type BillingPeriod = "monthly" | "yearly";

export type PricingPlan = {
  id: "free" | "starter" | "pro";
  name: string;
  tagline: string;
  /** Monthly price in US cents. The yearly price is derived from it (YEARLY_DISCOUNT). */
  monthlyCents: number;
  features: string[];
  cta: { label: string; href: string };
  recommended?: boolean;
};

/** Yearly billing: 20% off twelve monthly payments, billed upfront. */
export const YEARLY_DISCOUNT = 0.2;

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "For employers trying Callback.",
    monthlyCents: 0,
    features: [
      "Post jobs and publish them to the job board",
      "Review every applicant in Fast Manual Mode",
      "Original CV and cover letter, side by side",
      "A hiring status for each candidate",
    ],
    cta: { label: "Get started free", href: "/sign-up" },
  },
];

/** The amount charged per billing period, in cents: per month, or the discounted year upfront. */
export function periodCents(plan: PricingPlan, billing: BillingPeriod): number {
  return billing === "monthly" ? plan.monthlyCents : Math.round(plan.monthlyCents * 12 * (1 - YEARLY_DISCOUNT));
}

// Whole dollars without decimals ($19), otherwise two ($182.40). en-US on both server and client,
// so the prerendered price matches the hydrated one.
export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
