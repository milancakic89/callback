import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { HeroVisual } from "./hero-visual";
import { Container, ctaClass } from "./ui";

export function Hero({ openRoles }: { openRoles: string }) {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="l-hero-light pointer-events-none absolute inset-x-0 top-0 h-[60rem]" />
      <Container className="relative pt-14 sm:pt-20">
        <Link
          href="/jobs"
          className="l-rise group inline-flex items-center gap-2.5 rounded-full border border-(--l-line-strong) bg-white/[0.03] py-1 pr-3 pl-2 text-[13px] text-(--l-fg-muted) transition-colors hover:border-white/20 hover:text-(--l-fg)"
        >
          <span className="rounded-full bg-(--l-lime)/12 px-2 py-0.5 font-mono text-[10.5px] font-medium tracking-[0.08em] text-(--l-lime) uppercase">
            Live
          </span>
          <span>
            <span className="text-(--l-fg) tabular-nums">{openRoles}</span> open roles on the job board
          </span>
          <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <h1
          className="l-rise mt-8 text-[clamp(2.9rem,8.2vw,6.4rem)] leading-[0.94] font-semibold tracking-[-0.05em] text-balance sm:mt-10"
          style={{ "--l-delay": "90ms" } as React.CSSProperties}
        >
          Every application <br className="hidden sm:block" />
          deserves a response<span className="text-(--l-lime)">.</span>
        </h1>

        <div className="mt-8 flex flex-col gap-8 sm:mt-10 lg:flex-row lg:items-end lg:justify-between">
          <p
            className="l-rise max-w-xl text-lg leading-relaxed text-pretty text-(--l-fg-muted) sm:text-xl"
            style={{ "--l-delay": "180ms" } as React.CSSProperties}
          >
            Find your next opportunity. Review candidates faster. Make recruitment more transparent for
            everyone.
          </p>
          <div
            className="l-rise flex flex-wrap items-center gap-3"
            style={{ "--l-delay": "260ms" } as React.CSSProperties}
          >
            <Link href="/jobs" className={ctaClass("primary")}>
              Find a job
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a href="#employers" className={ctaClass("secondary")}>
              For employers
            </a>
          </div>
        </div>
      </Container>

      <Container className="relative mt-14 sm:mt-16">
        <HeroVisual />
      </Container>
    </section>
  );
}
