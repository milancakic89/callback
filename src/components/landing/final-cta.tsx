import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Container, ctaClass } from "./ui";

export function FinalCta({ openRoles }: { openRoles: string }) {
  return (
    <section className="relative overflow-hidden border-t border-(--l-line)">
      <div aria-hidden className="l-hero-light pointer-events-none absolute inset-x-0 top-0 h-[36rem]" />
      <Container className="relative py-28 sm:py-36">
        <h2
          data-reveal
          className="mx-auto max-w-4xl text-center text-[clamp(2.4rem,6vw,4.75rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-balance"
        >
          Better hiring starts with a better response<span className="text-(--l-lime)">.</span>
        </h2>

        <div data-reveal className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-4 sm:mt-16 md:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-(--l-line-strong) bg-(--l-surface) p-6 sm:p-8">
            <p className="font-mono text-[11px] tracking-[0.14em] text-(--l-fg-subtle) uppercase">For candidates</p>
            <p className="mt-4 text-xl font-medium tracking-[-0.015em]">Looking for your next role?</p>
            <p className="mt-2 text-[15px] leading-relaxed text-(--l-fg-muted)">
              Browse {openRoles} open roles and keep every application in one place. Free.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 sm:mt-auto sm:pt-8">
              <Link href="/jobs" className={ctaClass("primary")}>
                Find a job
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/sign-up" className={ctaClass("ghost", "px-3")}>
                Create an account
              </Link>
            </div>
          </div>
          <div className="flex flex-col rounded-2xl border border-(--l-line) bg-(--l-surface)/50 p-6 sm:p-8">
            <p className="font-mono text-[11px] tracking-[0.14em] text-(--l-fg-subtle) uppercase">For employers</p>
            <p className="mt-4 text-xl font-medium tracking-[-0.015em]">Hiring?</p>
            <p className="mt-2 text-[15px] leading-relaxed text-(--l-fg-muted)">
              Employer tools are in development. See how reviewing and answering applicants will work.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 sm:mt-auto sm:pt-8">
              <a href="#product" className={ctaClass("secondary")}>
                See the review workflow
              </a>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
