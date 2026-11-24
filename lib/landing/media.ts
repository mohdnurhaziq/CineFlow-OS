import fs from "node:fs";
import path from "node:path";

export type VideoSlot = "hero" | "shoot" | "deliver" | "print";

export interface LandingVideo {
  /** The 16:9 clip's URL, or null until the file exists (the page then shows just the poster). */
  mp4: string | null;
  /** The 9:16 clip for phones (hero only), or null. */
  mp4Portrait: string | null;
  poster: string;
  /** The still for phones (hero only): the first frame of the 9:16 clip, so it matches the video that follows. Null if absent. */
  posterPortrait: string | null;
}

/** Where a slot's clip and poster are. Server only: it looks at the files in public/landing (`publicDir` is for tests). */
export function landingVideo(slot: VideoSlot, publicDir: string = path.join(process.cwd(), "public")): LandingVideo {
  const exists = (file: string) => fs.existsSync(path.join(publicDir, file));
  const mp4 = `/landing/video/${slot}-16x9.mp4`;
  const portrait = `/landing/video/${slot}-9x16.mp4`;
  const posterPortrait = `/landing/posters/${slot}-9x16.jpg`;
  return {
    mp4: exists(mp4) ? mp4 : null,
    mp4Portrait: slot === "hero" && exists(portrait) ? portrait : null,
    poster: `/landing/posters/${slot}.jpg`,
    posterPortrait: slot === "hero" && exists(posterPortrait) ? posterPortrait : null,
  };
}
