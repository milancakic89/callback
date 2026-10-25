// Plan data for the landing page's pricing section (features/landing.md). Planned pricing for the
// employer tools, which are not built yet: there is no checkout, so every CTA follows the page's
// placeholder rule for employer actions and points at the employer section. Swap `cta.href` for a
// real route once plans can be bought.

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
    tagline: "For individuals exploring Callback.",
    monthlyCents: 0,
    features: ["1 active job", "Basic candidate management", "Manual candidate review", "CV and cover letter preview"],
    cta: { label: "Get started free", href: "#employers" },
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For small teams hiring occasionally.",
    monthlyCents: 1900,
    features: [
      "Up to 3 active jobs",
      "Unlimited manual candidate review",
      "Side-by-side original CV and cover letter",
      "Previous / Next candidate navigation",
      "Candidate status management",
    ],
    cta: { label: "Choose Starter", href: "#employers" },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For teams that want a faster screening process.",
    monthlyCents: 4900,
    features: [
      "Up to 10 active jobs",
      "Everything in Starter",
      "AI-assisted candidate screening",
      "Candidate ranking and filtering",
      "Fast Manual Review mode",
      "Higher AI screening limits",
    ],
    cta: { label: "Choose Pro", href: "#employers" },
    recommended: true,
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
