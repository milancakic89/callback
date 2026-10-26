import { PricingTable } from "./pricing-table";
import { AvailabilityTag, Container, SectionHeading } from "./ui";

// The employer side's plan (features/landing.md): just a Free plan for now, since pricing isn't being
// built. Tagged "Coming soon" like the rest of the employer side, and the note under the card says so.
export function Pricing() {
  return (
    <section id="pricing" className="border-t border-(--l-line)">
      <Container className="py-24 sm:py-32">
        <SectionHeading
          align="center"
          eyebrow="Pricing"
          tag={<AvailabilityTag status="soon" />}
          title="Start free."
          className="mx-auto"
        >
          The employer tools will start with a free plan.
        </SectionHeading>

        <div data-reveal className="mt-12 sm:mt-14">
          <PricingTable />
        </div>

        <p data-reveal className="mx-auto mt-10 max-w-2xl text-center text-[13px] leading-relaxed text-(--l-fg-subtle)">
          The plan opens when the employer tools launch. Nothing is charged on Callback today.
        </p>
      </Container>
    </section>
  );
}
