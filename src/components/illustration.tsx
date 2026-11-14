import Image from "next/image";
import { cn } from "@/lib/utils";

export const ILLUSTRATIONS = [
  "onboarding",
  "nutrition",
  "progress",
  "rest-day",
  "workout-done",
  "calendar",
] as const;
export type IllustrationName = (typeof ILLUSTRATIONS)[number];

const WIDTH = 960;
const HEIGHT = 536;

/**
 * Schmuckgrafik zu einem Bereich der App (mit der Antigravity-CLI erzeugt, siehe docs/GRAPHICS.md).
 * Rein dekorativ: ohne Alternativtext, für Screenreader ausgeblendet.
 */
export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return (
    <Image
      src={`/illustrations/${name}.jpg`}
      alt=""
      aria-hidden
      width={WIDTH}
      height={HEIGHT}
      className={cn("aspect-video w-full rounded-xl object-cover", className)}
    />
  );
}
