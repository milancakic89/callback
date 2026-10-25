import Image from "next/image";
import { cn } from "cn";

// The app's logo. public/logo-cropped.png is public/logo.png trimmed to its content (the original
// has wide empty margins, which would push it around in a header and make it look small). Size it by
// height through `className`; the width follows the aspect ratio. Wherever the name is plain text —
// page titles, email subjects, docs — it's just "Callback".
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-cropped.png"
      alt="Callback"
      width={266}
      height={61}
      // Always above the fold (a header or the top of an auth page), so don't wait to scroll near it.
      loading="eager"
      className={cn("h-6 w-auto", className)}
    />
  );
}
