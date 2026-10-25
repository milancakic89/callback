import { ArrowRightIcon } from "lucide-react";
import { Container, Eyebrow } from "./ui";

const SHIFTS = [
  { before: "Applications disappear without a reply", after: "Candidates see where they stand" },
  { before: "CVs and cover letters spread across tabs", after: "Both documents, side by side" },
  { before: "The same status email, written again and again", after: "Updates sent from your templates" },
];

export function Problem() {
  return (
    <section className="border-t border-(--l-line)">
      <Container className="py-24 sm:py-32">
        <Eyebrow>The problem</Eyebrow>
        <p
          data-reveal
          className="mt-8 max-w-4xl text-[clamp(1.75rem,3.7vw,3rem)] leading-[1.12] font-medium tracking-[-0.03em] text-balance"
        >
          <span className="text-(--l-fg-subtle)">
            Candidates send applications and hear nothing back. Recruiters work through stacks of PDFs,
            browser tabs and inbox threads.{" "}
          </span>
          Both sides lose time, and nobody gets a clear answer.
        </p>

        <div data-reveal className="mt-16 border-t border-(--l-line) sm:mt-20">
          <div className="hidden grid-cols-[1fr_3rem_1fr] py-4 md:grid">
            <p className="font-mono text-[11px] tracking-[0.14em] text-(--l-fg-subtle) uppercase">Today</p>
            <span />
            <p className="font-mono text-[11px] tracking-[0.14em] text-(--l-lime)/80 uppercase">With Callback</p>
          </div>
          <ul>
            {SHIFTS.map((shift) => (
              <li
                key={shift.before}
                className="grid gap-2 border-t border-(--l-line) py-5 md:grid-cols-[1fr_3rem_1fr] md:items-center md:gap-0 md:first:border-t-0 md:py-6"
              >
                <p className="text-[15px] text-(--l-fg-subtle) sm:text-base">{shift.before}</p>
                <ArrowRightIcon className="hidden size-4 text-(--l-fg-subtle) md:block" />
                <p className="flex items-center gap-2 text-[15px] font-medium sm:text-base">
                  <ArrowRightIcon className="size-4 shrink-0 text-(--l-lime) md:hidden" />
                  {shift.after}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
