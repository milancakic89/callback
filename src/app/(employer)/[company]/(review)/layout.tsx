import "@/components/landing/landing.css";
import { DarkSurface } from "@/components/dark-surface";

// The applicant review (features/applicant-review.md) takes the whole screen, without the sidebar:
// the playlist, both documents and the screening overview need every column there is. It is dark,
// in the landing's palette: `data-landing` gives the --l-* tokens of landing.css (the same ones the
// landing's Fast Manual Mode demo uses), and `dark` makes shadcn components use the dark tokens,
// which are that palette too (globals.css). The page checks the slug and the account itself.
export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-landing className="dark flex h-dvh w-full flex-col overflow-hidden">
      <DarkSurface />
      {children}
    </div>
  );
}
