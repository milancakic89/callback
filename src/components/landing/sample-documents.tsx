import { cn } from "cn";
import { MOCK_CANDIDATES, type MockCandidateKey } from "@/lib/candidates/mock-candidates";

// Fictional candidates and documents for the landing page's review demos (features/landing.md).
// Every name, company, school and address here is invented; emails use the reserved example.com
// domain. Each CV uses a different layout on purpose: Fast Manual Mode shows the files candidates
// actually sent, not a normalised profile card. Plain components (no hooks), so both the static
// hero and the interactive demo can render them.

export const SAMPLE_ROLE = { title: "Senior Product Designer", company: "Halden" };

export type SampleCandidate = {
  id: string;
  name: string;
  location: string;
  cvFile: string;
  letterFile: string;
  Cv: () => React.ReactElement;
  Letter: () => React.ReactElement;
};

export function Paper({ className, children }: { className?: string; children: React.ReactNode }) {
  return <article className={cn("l-paper mx-auto w-full", className)}>{children}</article>;
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-[1.8em] mb-[0.7em] border-b border-black/15 pb-[0.35em] text-[0.74em] font-semibold tracking-[0.16em] text-black/70 uppercase">
      {children}
    </p>
  );
}

function Role({ title, org, dates }: { title: string; org: string; dates: string }) {
  return (
    <div className="mt-[0.9em] flex items-baseline justify-between gap-[1em]">
      <p>
        <span className="font-semibold">{title}</span>
        <span className="text-black/60">, {org}</span>
      </p>
      <p className="shrink-0 text-[0.86em] text-black/55 tabular-nums">{dates}</p>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-[0.35em] flex list-disc flex-col gap-[0.25em] pl-[1.15em] leading-[1.45] text-black/80 marker:text-black/35">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

// ——— Ana Novak: classic single-column CV, sans ———

function AnaNovakCv() {
  return (
    <Paper className="l-doc-sans p-[2.2em] sm:p-[3.4em]">
      <p className="text-[2.3em] leading-none font-semibold tracking-[-0.02em]">Ana Novak</p>
      <p className="mt-[0.45em] text-[1.08em] text-black/70">Senior Product Designer</p>
      <p className="mt-[0.9em] text-[0.86em] leading-[1.5] text-black/55">
        Belgrade, Serbia · ana.novak@example.com · ananovak.example
      </p>

      <Rule>Profile</Rule>
      <p className="leading-[1.5] text-black/80">
        Product designer with seven years of experience shipping B2B software. I work best close to
        engineering, turning messy workflows into calm, fast interfaces, and I care about design
        systems that teams actually use.
      </p>

      <Rule>Experience</Rule>
      <Role title="Lead Product Designer" org="Fernway" dates="2022 – Present" />
      <Bullets
        items={[
          "Led the redesign of the scheduling product, cutting the steps to book a shift from nine to four.",
          "Built and maintain the Fernway design system, used by four product teams.",
          "Mentor two product designers and run the weekly design critique.",
        ]}
      />
      <Role title="Product Designer" org="Quillstone" dates="2019 – 2022" />
      <Bullets
        items={[
          "Owned onboarding and billing flows for a 40-person SaaS team.",
          "Made usability testing a fortnightly habit across product and support.",
        ]}
      />
      <Role title="Junior Designer" org="Arbor & Finch Studio" dates="2017 – 2019" />
      <Bullets items={["Websites and brand systems for cultural and non-profit clients."]} />

      <Rule>Education</Rule>
      <Role title="BA Graphic Design" org="Sava Academy of Arts" dates="2017" />

      <Rule>Skills</Rule>
      <p className="leading-[1.55] text-black/80">
        Figma · Design systems · Prototyping · Usability testing · HTML & CSS · Workshop facilitation
      </p>
      <p className="mt-[0.6em] leading-[1.55] text-black/60">Serbian (native) · English (C2) · German (B1)</p>
    </Paper>
  );
}

function AnaNovakLetter() {
  return (
    <Paper className="l-doc-serif p-[2.4em] leading-[1.6] sm:p-[3.8em]">
      <div className="text-[0.92em] leading-[1.45] text-black/70">
        <p className="font-semibold text-black">Ana Novak</p>
        <p>Belgrade, Serbia</p>
        <p>ana.novak@example.com</p>
      </div>
      <p className="mt-[1.6em] text-[0.92em] text-black/70">14 October 2026</p>
      <div className="mt-[1.4em] text-[0.92em] leading-[1.45] text-black/70">
        <p>Hiring Team</p>
        <p>Halden</p>
      </div>
      <p className="mt-[1.6em] font-semibold">Re: Senior Product Designer</p>
      <p className="mt-[1.2em]">Dear Hiring Team,</p>
      <div className="mt-[0.9em] flex flex-col gap-[0.9em] text-black/85">
        <p>
          I&rsquo;m writing to apply for the Senior Product Designer role. Halden&rsquo;s focus on tools
          that operations teams use all day is exactly the work I&rsquo;ve spent the last seven years on,
          and the problem in your posting, dense information that still has to feel fast, is the one I
          enjoy most.
        </p>
        <p>
          At Fernway I led the redesign of our scheduling product. We started from support tickets
          rather than screens, and the new flow cut booking from nine steps to four. Just as
          important, I built the design system that let four teams ship that quality without waiting
          on me.
        </p>
        <p>
          I&rsquo;d bring the same habits to Halden: research close to the work, small releases, and a
          system that makes the next screen easier than the last. I would welcome the chance to walk
          you through the scheduling project.
        </p>
      </div>
      <p className="mt-[1.4em]">Kind regards,</p>
      <p className="mt-[0.3em] font-semibold">Ana Novak</p>
    </Paper>
  );
}

// ——— Jonas Weber: two-column CV with a tinted sidebar, sans ———

function JonasWeberCv() {
  return (
    <Paper className="l-doc-sans grid grid-cols-[34%_1fr]">
      <aside className="bg-[#eef1f4] px-[1.5em] py-[2.4em] sm:px-[1.9em] sm:py-[3.2em]">
        <p className="text-[1.75em] leading-[1.05] font-bold tracking-[-0.01em] text-[#1d3557]">
          Jonas
          <br />
          Weber
        </p>
        <p className="mt-[0.6em] text-[0.9em] text-black/60">Product Designer</p>
        <p className="mt-[2em] text-[0.72em] font-bold tracking-[0.14em] text-[#1d3557] uppercase">Contact</p>
        <div className="mt-[0.5em] flex flex-col gap-[0.25em] text-[0.86em] break-words text-black/70">
          <p>Hamburg, Germany</p>
          <p>jonas.weber@example.com</p>
          <p>jonasweber.example</p>
        </div>
        <p className="mt-[1.8em] text-[0.72em] font-bold tracking-[0.14em] text-[#1d3557] uppercase">Skills</p>
        <ul className="mt-[0.5em] flex flex-col gap-[0.25em] text-[0.86em] text-black/70">
          <li>Interaction design</li>
          <li>Information architecture</li>
          <li>Accessibility (WCAG 2.2)</li>
          <li>Prototyping</li>
          <li>Design tokens</li>
        </ul>
        <p className="mt-[1.8em] text-[0.72em] font-bold tracking-[0.14em] text-[#1d3557] uppercase">Languages</p>
        <p className="mt-[0.5em] text-[0.86em] leading-[1.5] text-black/70">German, English, Spanish (basic)</p>
      </aside>
      <div className="px-[1.6em] py-[2.4em] sm:px-[2.2em] sm:py-[3.2em]">
        <p className="text-[0.72em] font-bold tracking-[0.14em] text-[#1d3557] uppercase">About</p>
        <p className="mt-[0.5em] leading-[1.5] text-black/80">
          Designer focused on complex, regulated products. Six years making clinical and banking
          software clear enough to use under pressure.
        </p>
        <p className="mt-[1.8em] text-[0.72em] font-bold tracking-[0.14em] text-[#1d3557] uppercase">Experience</p>
        <Role title="Product Designer" org="Tidewell Health" dates="2021 – now" />
        <Bullets
          items={[
            "Designed the clinician dashboard for appointment and referral tracking.",
            "Ran accessibility audits and fixed 120+ issues with engineering.",
            "Introduced design tokens shared between web and iOS.",
          ]}
        />
        <Role title="UX Designer" org="Northmere Bank" dates="2018 – 2021" />
        <Bullets
          items={[
            "Redesigned business account onboarding end to end.",
            "Wrote the bank's first interaction guidelines.",
          ]}
        />
        <p className="mt-[1.8em] text-[0.72em] font-bold tracking-[0.14em] text-[#1d3557] uppercase">Education</p>
        <Role title="MSc Human–Computer Interaction" org="Elbe Institute of Design" dates="2018" />
      </div>
    </Paper>
  );
}

function JonasWeberLetter() {
  return (
    <Paper className="l-doc-sans p-[2.2em] leading-[1.6] sm:p-[3.4em]">
      <div className="h-[0.35em] w-[3.5em] bg-[#1d3557]" />
      <p className="mt-[1.2em] text-[1.5em] font-bold tracking-[-0.01em] text-[#1d3557]">Jonas Weber</p>
      <p className="text-[0.88em] text-black/55">Hamburg · jonas.weber@example.com</p>
      <p className="mt-[2em] text-[0.88em] text-black/55">15 October 2026</p>
      <p className="mt-[1.4em]">Hello Halden team,</p>
      <div className="mt-[0.9em] flex flex-col gap-[0.9em] text-black/80">
        <p>
          I&rsquo;d like to be considered for the Senior Product Designer position. I&rsquo;ve spent my
          career on products where a confusing screen has real consequences, a missed referral or a
          blocked account, and I&rsquo;ve learned to design for the busiest day, not the demo.
        </p>
        <p>
          At Tidewell I redesigned the clinician dashboard together with nurses and front-desk staff.
          We tested every iteration in clinics rather than in the office, and the final version
          became the default view for all new clinics.
        </p>
        <p>
          Your posting mentions accessibility and a growing design system. Both have been central to
          my last two roles, and I&rsquo;d be glad to share examples.
        </p>
      </div>
      <p className="mt-[1.4em]">Best regards,</p>
      <p className="mt-[0.3em] font-semibold">Jonas Weber</p>
    </Paper>
  );
}

// ——— Priya Raman: centred, serif CV ———

function PriyaRamanCv() {
  return (
    <Paper className="l-doc-serif p-[2.4em] sm:p-[3.6em]">
      <div className="text-center">
        <p className="text-[2.1em] leading-none tracking-[0.04em]">PRIYA RAMAN</p>
        <p className="mt-[0.6em] text-[0.92em] tracking-[0.06em] text-black/60">
          Lisbon, Portugal · priya.raman@example.com · priyaraman.example
        </p>
      </div>
      <div className="mt-[1.6em] h-px bg-black/20" />
      <p className="mt-[1.4em] text-center leading-[1.55] text-black/80 italic">
        Product designer who moves comfortably between research, interaction design and front-end
        prototypes.
      </p>

      <Rule>Experience</Rule>
      <Role title="Senior Designer" org="Brightfold" dates="2020 – present" />
      <Bullets
        items={[
          "Lead designer for the logistics planning tool used by dispatch teams.",
          "Set up a research repository and a monthly customer panel.",
          "Prototype in code to test interactions with real data early.",
        ]}
      />
      <Role title="Interaction Designer" org="Oakline Mobility" dates="2017 – 2020" />
      <Bullets
        items={[
          "Designed the driver app's trip flow and offline states.",
          "Partnered with support to turn top complaints into a quarterly roadmap.",
        ]}
      />

      <Rule>Education</Rule>
      <Role title="BDes Interaction Design" org="Tagus School of Design" dates="2017" />

      <Rule>Selected work</Rule>
      <p className="leading-[1.55] text-black/80">
        Dispatch planner redesign · Offline-first driver app · Brightfold design language
      </p>
    </Paper>
  );
}

function PriyaRamanLetter() {
  return (
    <Paper className="l-doc-sans p-[2.2em] leading-[1.65] sm:p-[3.4em]">
      <p className="text-[0.88em] text-black/55">Priya Raman · priya.raman@example.com · 16 October 2026</p>
      <p className="mt-[2em]">Dear Halden hiring team,</p>
      <div className="mt-[0.9em] flex flex-col gap-[0.9em] text-black/80">
        <p>
          Halden&rsquo;s product looks a lot like the planning tools I work on every day: a lot of
          information, a lot of time pressure, and people who rely on it to get through their shift.
          That&rsquo;s why your Senior Product Designer opening caught my attention.
        </p>
        <p>
          At Brightfold I lead design for our dispatch planner. I like to prototype in code with real
          data early, because that&rsquo;s where most planning problems show up, and I keep a close loop
          with the support team so the roadmap reflects what customers actually struggle with.
        </p>
        <p>I&rsquo;ve attached my CV and would be happy to talk whenever suits you.</p>
      </div>
      <p className="mt-[1.4em]">Thank you,</p>
      <p className="mt-[0.3em] font-semibold">Priya Raman</p>
    </Paper>
  );
}

// The candidates themselves (name, files, email) live in src/lib/candidates/mock-candidates.ts, which
// the seed script and the employer dashboard share; this only adds the document components. The
// Record makes a candidate without documents a type error.
const DOCUMENTS: Record<MockCandidateKey, Pick<SampleCandidate, "Cv" | "Letter">> = {
  "ana-novak": { Cv: AnaNovakCv, Letter: AnaNovakLetter },
  "jonas-weber": { Cv: JonasWeberCv, Letter: JonasWeberLetter },
  "priya-raman": { Cv: PriyaRamanCv, Letter: PriyaRamanLetter },
};

export const SAMPLE_CANDIDATES: SampleCandidate[] = MOCK_CANDIDATES.map((candidate) => ({
  id: candidate.key,
  name: candidate.name,
  location: candidate.location,
  cvFile: candidate.cvFile,
  letterFile: candidate.letterFile,
  ...DOCUMENTS[candidate.key],
}));
