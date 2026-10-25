"use client";

import { useState } from "react";
import { cn } from "cn";
import { PricingCard } from "./pricing-card";
import { PRICING_PLANS, YEARLY_DISCOUNT, type BillingPeriod } from "./pricing-plans";

const PERIODS: { id: BillingPeriod; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

// The Monthly / Yearly switch and the plan cards it drives. Frontend only: the choice isn't stored
// or sent anywhere.
export function PricingTable() {
  const [billing, setBilling] = useState<BillingPeriod>("monthly");

  return (
    <div>
      <div className="flex flex-col items-center gap-3">
        <div
          role="group"
          aria-label="Billing period"
          className="inline-flex rounded-full border border-(--l-line-strong) bg-white/[0.03] p-1"
        >
          {PERIODS.map((period) => (
            <button
              key={period.id}
              type="button"
              aria-pressed={billing === period.id}
              onClick={() => setBilling(period.id)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-colors",
                billing === period.id
                  ? "bg-white/[0.09] text-(--l-fg)"
                  : "text-(--l-fg-subtle) hover:text-(--l-fg-muted)",
              )}
            >
              {period.label}
              {period.id === "yearly" && (
                <span className="rounded-full bg-(--l-lime)/12 px-1.5 py-0.5 font-mono text-[10.5px] text-(--l-lime)">
                  −{Math.round(YEARLY_DISCOUNT * 100)}%
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-(--l-fg-subtle)" aria-live="polite">
          {billing === "monthly"
            ? "Pay month to month. Switch to yearly to save 20%."
            : "Yearly plans are billed upfront for 12 months, at 20% off."}
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PRICING_PLANS.map((plan) => (
          <PricingCard key={plan.id} plan={plan} billing={billing} />
        ))}
      </div>
    </div>
  );
}
