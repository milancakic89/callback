// The three fictional candidates that every company's demo job starts with (features/demo-job.md).
// Plain data, shared by the landing page's review demos (src/components/landing/sample-documents.tsx,
// which adds the document components) and the seed script (scripts/seed-mock-candidates.ts).
// Every name is invented; emails use the reserved example.com domain.

export type MockCandidate = {
  // Also `candidate_profiles.sample_key`, which is how a profile finds its entry here.
  key: string;
  name: string;
  location: string;
  email: string;
  cvFile: string;
  letterFile: string;
};

export const MOCK_CANDIDATES = [
  {
    key: "ana-novak",
    name: "Ana Novak",
    location: "Belgrade, Serbia",
    email: "ana.novak@example.com",
    cvFile: "Ana_Novak_CV.pdf",
    letterFile: "Cover_letter_Ana_Novak.pdf",
  },
  {
    key: "jonas-weber",
    name: "Jonas Weber",
    location: "Hamburg, Germany",
    email: "jonas.weber@example.com",
    cvFile: "Jonas-Weber-Resume.pdf",
    letterFile: "Jonas-Weber-Letter.pdf",
  },
  {
    key: "priya-raman",
    name: "Priya Raman",
    location: "Lisbon, Portugal",
    email: "priya.raman@example.com",
    cvFile: "priya_raman_cv_2026.pdf",
    letterFile: "priya_raman_cover.pdf",
  },
] as const satisfies readonly MockCandidate[];

export type MockCandidateKey = (typeof MOCK_CANDIDATES)[number]["key"];
