import { describe, expect, it } from "vitest";
import { PRICING_PLANS, YEARLY_DISCOUNT, formatUsd, periodCents, type PricingPlan } from "./pricing-plans";

const paid: PricingPlan = {
  id: "starter",
  name: "Starter",
  tagline: "",
  monthlyCents: 1900,
  features: [],
  cta: { label: "", href: "" },
};

describe("PRICING_PLANS", () => {
  it("offers a free plan", () => {
    expect(PRICING_PLANS.some((plan) => plan.monthlyCents === 0)).toBe(true);
  });

  it("has a unique id per plan", () => {
    const ids = PRICING_PLANS.map((plan) => plan.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("periodCents", () => {
  it("charges the monthly price month to month", () => {
    expect(periodCents(paid, "monthly")).toBe(1900);
  });

  it("charges twelve months at the yearly discount, upfront", () => {
    expect(YEARLY_DISCOUNT).toBe(0.2);
    expect(periodCents(paid, "yearly")).toBe(18240);
    expect(periodCents({ ...paid, monthlyCents: 4900 }, "yearly")).toBe(47040);
  });

  it("charges nothing for a free plan", () => {
    expect(periodCents({ ...paid, monthlyCents: 0 }, "yearly")).toBe(0);
  });
});

describe("formatUsd", () => {
  it("shows whole dollars without decimals, and cents otherwise", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(1900)).toBe("$19");
    expect(formatUsd(18240)).toBe("$182.40");
    expect(formatUsd(47040)).toBe("$470.40");
  });
});
