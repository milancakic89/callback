import type { ReactNode } from "react";

// One numbered part of a legal text. The id is the anchor the contents list links to.
export type LegalSectionContent = { id: string; title: string; body: ReactNode };

type LegalDocumentProps = {
  title: string;
  lastUpdated: string;
  intro: ReactNode;
  sections: LegalSectionContent[];
};

// The markup of a text's body is plain HTML (paragraphs, lists, links, <strong>), styled here, so the
// texts read as ordinary prose in their source files.
const BODY_STYLE =
  "grid gap-3 text-[15px] leading-7 text-foreground/90 " +
  "[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-foreground " +
  "[&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-6 [&_strong]:font-semibold [&_strong]:text-foreground";

// A legal text (features/legal-pages.md): a title, the date it was last changed, an intro, a list of
// contents and the numbered sections. The contents list is made from the sections themselves, so it
// can't point at one that isn't there.
export function LegalDocument({ title, lastUpdated, intro, sections }: LegalDocumentProps) {
  return (
    <article className="grid gap-8">
      <header className="grid gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        <div className={BODY_STYLE}>{intro}</div>
      </header>

      <nav aria-label="Contents" className="rounded-lg bg-muted/50 p-4 sm:p-5">
        <p className="text-sm font-medium">Contents</p>
        <ol className="mt-3 grid list-inside list-decimal gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((section, index) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="grid scroll-mt-24 gap-3">
          <h2 id={`${section.id}-heading`} className="text-xl font-semibold tracking-tight">
            {index + 1}. {section.title}
          </h2>
          <div className={BODY_STYLE}>{section.body}</div>
        </section>
      ))}
    </article>
  );
}
