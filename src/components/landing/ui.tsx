import { cn } from "cn";

// Small building blocks shared by the landing sections (features/landing.md). Colours come from the
// --l-* tokens in landing.css.

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[11px] font-medium tracking-[0.16em] text-(--l-fg-subtle) uppercase", className)}>
      {children}
    </p>
  );
}

// Marks what exists today versus what is still being built, so the page never presents a planned
// feature as shipped. "partial" is for a section that mixes both: some of it works today and some of
// it is still to come, which the text of the section then says.
const AVAILABILITY = {
  live: {
    label: "Available now",
    tag: "border-(--l-lime)/25 bg-(--l-lime)/[0.07] text-(--l-lime)",
    dot: "bg-(--l-lime)",
  },
  partial: {
    label: "Partly available",
    tag: "border-(--l-lime)/20 bg-white/[0.03] text-(--l-fg-muted)",
    dot: "bg-(--l-lime)",
  },
  soon: {
    label: "Coming soon",
    tag: "border-(--l-line-strong) bg-white/[0.03] text-(--l-fg-muted)",
    dot: "bg-(--l-fg-subtle)",
  },
} as const;

export type Availability = keyof typeof AVAILABILITY;

export function AvailabilityTag({ status, className }: { status: Availability; className?: string }) {
  const { label, tag, dot } = AVAILABILITY[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-medium tracking-[0.08em] uppercase",
        tag,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  align = "left",
  className,
  tag,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  tag?: React.ReactNode;
}) {
  return (
    <div
      data-reveal
      className={cn("flex flex-col gap-5", align === "center" && "items-center text-center", className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow>{eyebrow}</Eyebrow>
        {tag}
      </div>
      <h2 className="max-w-3xl text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance">
        {title}
      </h2>
      {children && (
        <p className="max-w-2xl text-base leading-relaxed text-pretty text-(--l-fg-muted) sm:text-lg">{children}</p>
      )}
    </div>
  );
}

const CTA_BASE =
  "group inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-200 active:translate-y-px";

const CTA_VARIANTS = {
  primary: "bg-(--l-lime) text-(--l-on-lime) hover:bg-(--l-lime-hover)",
  secondary:
    "border border-(--l-line-strong) bg-white/[0.03] text-(--l-fg) hover:border-white/20 hover:bg-white/[0.06]",
  ghost: "text-(--l-fg-muted) hover:text-(--l-fg)",
};

export function ctaClass(variant: keyof typeof CTA_VARIANTS = "primary", className?: string) {
  return cn(CTA_BASE, CTA_VARIANTS[variant], className);
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-(--l-line-strong) bg-white/[0.04] px-1 font-mono text-[10.5px] text-(--l-fg-muted)">
      {children}
    </kbd>
  );
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.07] font-mono text-[10.5px] font-medium text-(--l-fg-muted)",
        className,
      )}
    >
      {initials}
    </span>
  );
}
