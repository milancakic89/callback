import { notFound } from "next/navigation";
import "@/components/landing/landing.css";
import { SAMPLE_DOCUMENTS } from "@/components/landing/sample-documents";
import { MOCK_CANDIDATES } from "@/lib/candidates/mock-candidates";

// Development only: the demo job's documents, one A4 sheet each, for scripts/build-demo-documents.ts
// to print to PDF (features/applicant-review.md). They are the landing's sample documents, so the
// landing demo and the review screen show the same files. A production build answers 404.
//
// .l-paper (landing.css) is 34rem wide at --z 1 and already A4-shaped; A4 at 96 dpi is 793.7px wide.
const A4_ZOOM = 793.7 / 544;

export default function DemoDocumentsPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const documents = MOCK_CANDIDATES.flatMap((candidate) => {
    const { Cv, Letter } = SAMPLE_DOCUMENTS[candidate.key];
    return [
      { id: `${candidate.key}/cv`, title: candidate.cvFile, Document: Cv },
      ...(candidate.demoCoverLetter
        ? [{ id: `${candidate.key}/cover-letter`, title: candidate.letterFile, Document: Letter }]
        : []),
    ];
  });

  return (
    // The paper colour behind the sheets, so no dark edge can reach a printed page.
    <div data-landing style={{ "--z": A4_ZOOM, background: "var(--l-paper)" } as React.CSSProperties}>
      {documents.map(({ id, title, Document }) => (
        <section key={id} data-document={id} data-title={title} className="w-[793.7px] [&_.l-paper]:shadow-none!">
          <Document />
        </section>
      ))}
    </div>
  );
}
