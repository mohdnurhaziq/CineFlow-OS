import fs from "node:fs";
import path from "node:path";

export type VideoSlot = "hero" | "shoot" | "deliver" | "print";

export interface LandingVideo {
  /** The 16:9 clip's URL, or null until the file exists (the page then shows just the poster). */
  mp4: string | null;
  /** The 9:16 clip for phones (hero only), or null. */
  mp4Portrait: string | null;
  poster: string;
}

const exists = (file: string) => fs.existsSync(path.join(process.cwd(), "public", file));

/** Where a slot's clip and poster are. Server only: it looks at the files in public/landing. */
export function landingVideo(slot: VideoSlot): LandingVideo {
  const mp4 = `/landing/video/${slot}-16x9.mp4`;
  const portrait = `/landing/video/${slot}-9x16.mp4`;
  return {
    mp4: exists(mp4) ? mp4 : null,
    mp4Portrait: slot === "hero" && exists(portrait) ? portrait : null,
    poster: `/landing/posters/${slot}.jpg`,
  };
}
