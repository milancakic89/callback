import { PricingTable } from "./pricing-table";
import { AvailabilityTag, Container, SectionHeading } from "./ui";

// Planned employer pricing (features/landing.md). Tagged "Coming soon" like the rest of the employer
// side: nothing can be bought yet, and the note under the cards says so.
export function Pricing() {
  return (
    <section id="pricing" className="border-t border-(--l-line)">
      <Container className="py-24 sm:py-32">
        <SectionHeading
          align="center"
          eyebrow="Pricing"
          tag={<AvailabilityTag status="soon" />}
          title="Start free. Upgrade when you hire more."
          className="mx-auto"
        >
          Plans for the employer tools, from a single open role to a team screening every week.
        </SectionHeading>

        <div data-reveal className="mt-12 sm:mt-14">
          <PricingTable />
        </div>

        <p data-reveal className="mx-auto mt-10 max-w-2xl text-center text-[13px] leading-relaxed text-(--l-fg-subtle)">
          Prices in US dollars. Plans open when the employer tools launch; pricing may change before then, and
          nothing is charged on Callback today.
        </p>
      </Container>
    </section>
  );
}
