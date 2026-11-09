import Image from "next/image";
import { cn } from "cn";
import type { ReviewShot } from "./review-shots";

// One screenshot of Fast Manual Mode (review-shots.ts), framed like a window. From `lg` the
// laptop's four columns; below that the phone's view, centred and narrow, since four columns shrunk
// to a phone's width cannot be read. The browser downloads only the one that shows: the other has
// `display: none` and is lazy. `decorative` is for a copy of a shot that sits near its twin (the
// hero's): its alt text is empty so a screen reader does not read it twice.
const FRAME = "overflow-hidden border border-(--l-line-strong) bg-(--l-surface) shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)]";

export function ProductShot({
  shot,
  decorative = false,
  className,
}: {
  shot: ReviewShot;
  decorative?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Image
        src={shot.desktop.src}
        width={shot.desktop.width}
        height={shot.desktop.height}
        alt={decorative ? "" : shot.desktop.alt}
        sizes="(min-width: 1200px) 1136px, (min-width: 1024px) calc(100vw - 4rem), calc(100vw - 2rem)"
        className={cn(FRAME, "hidden h-auto w-full rounded-xl lg:block")}
      />
      <Image
        src={shot.mobile.src}
        width={shot.mobile.width}
        height={shot.mobile.height}
        alt={decorative ? "" : shot.mobile.alt}
        sizes="(min-width: 640px) 320px, 80vw"
        className={cn(FRAME, "mx-auto h-auto w-full max-w-[18rem] rounded-2xl sm:max-w-80 lg:hidden")}
      />
    </div>
  );
}
