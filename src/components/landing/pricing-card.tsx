import { CheckIcon } from "lucide-react";
import { cn } from "cn";
import { formatUsd, periodCents, type BillingPeriod, type PricingPlan } from "./pricing-plans";
import { ctaClass } from "./ui";

// One plan. Plain component (no hooks): the billing period comes from PricingTable.
export function PricingCard({ plan, billing }: { plan: PricingPlan; billing: BillingPeriod }) {
  const cents = periodCents(plan, billing);
  const free = plan.monthlyCents === 0;
  const note = free
    ? "No payment needed"
    : billing === "monthly"
      ? "Billed monthly"
      : `Billed upfront, once a year · ${formatUsd(Math.round(cents / 12))}/month`;

  // Phones: one card per row, stacked. Tablets (md to lg): still one per row, but each card splits into
  // price on the left and features on the right, since three columns would be too narrow to read.
  // Desktop: three columns, with min-heights on the text above the price so prices and CTAs line up
  // across cards even when a tagline or billing note wraps.
  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className={cn(
        "relative flex flex-col rounded-2xl border p-6 sm:p-8 md:max-lg:grid md:max-lg:grid-cols-2 md:max-lg:gap-x-10",
        plan.recommended
          ? "border-(--l-lime)/35 bg-(--l-surface-2) shadow-[0_30px_80px_-40px_rgb(198_242_78/0.25)]"
          : "border-(--l-line-strong) bg-(--l-surface)",
      )}
    >
      {plan.recommended && (
        <>
          {/* A lime hairline along the top edge: enough to mark the plan without a glow. */}
          <span
            aria-hidden
            className="absolute inset-x-8 -top-px h-px bg-linear-to-r from-transparent via-(--l-lime) to-transparent"
          />
          <span className="absolute top-6 right-6 rounded-full border border-(--l-lime)/30 bg-(--l-lime)/[0.08] px-2.5 py-0.5 font-mono text-[10.5px] font-medium tracking-[0.08em] text-(--l-lime) uppercase sm:top-8 sm:right-8">
            Recommended
          </span>
        </>
      )}

      <div className="flex flex-col">
        <h3 id={`plan-${plan.id}`} className="text-lg font-medium tracking-[-0.01em]">
          {plan.name}
        </h3>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-(--l-fg-muted) lg:min-h-[3.25em]">
          {plan.tagline}
        </p>

        <p className="mt-6 flex items-baseline gap-1.5">
          <span className="text-[2.6rem] leading-none font-semibold tracking-[-0.04em] tabular-nums">
            {formatUsd(cents)}
          </span>
          <span className="text-[14px] text-(--l-fg-subtle)">/{billing === "monthly" ? "month" : "year"}</span>
        </p>
        <p className="mt-2.5 text-[13px] leading-snug text-(--l-fg-subtle) lg:min-h-[2.75em]">{note}</p>

        <a href={plan.cta.href} className={ctaClass(plan.recommended ? "primary" : "secondary", "mt-6 w-full")}>
          {plan.cta.label}
        </a>
      </div>

      <ul className="mt-8 flex flex-col gap-3 border-t border-(--l-line) pt-6 md:max-lg:mt-12 md:max-lg:border-t-0 md:max-lg:pt-0">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2.5 text-[14.5px] leading-snug text-(--l-fg-muted)">
            <CheckIcon
              aria-hidden
              className={cn("mt-0.5 size-4 shrink-0", plan.recommended ? "text-(--l-lime)" : "text-(--l-fg-subtle)")}
              strokeWidth={2}
            />
            {feature}
          </li>
        ))}
      </ul>
    </article>
  );
}
