import { PricingTable } from "./pricing-table";
import { AvailabilityTag, Container, SectionHeading } from "./ui";

// The employer side's plan (features/landing.md): just a Free plan for now, since pricing isn't being
// built. An employer can open an account today, so the plan is available now, and the note under the
// card says that nothing is charged.
export function Pricing() {
  return (
    <section id="pricing" className="border-t border-(--l-line)">
      <Container className="py-24 sm:py-32">
        <SectionHeading
          align="center"
          eyebrow="Pricing"
          tag={<AvailabilityTag status="live" />}
          title="Start free."
          className="mx-auto"
        >
          Employer accounts are free to open today.
        </SectionHeading>

        <div data-reveal className="mt-12 sm:mt-14">
          <PricingTable />
        </div>

        <p data-reveal className="mx-auto mt-10 max-w-2xl text-center text-[13px] leading-relaxed text-(--l-fg-subtle)">
          Nothing is charged on Callback today.
        </p>
      </Container>
    </section>
  );
}
