/**
 * How far the second copy of a looping clip has faded in, 0 to 1.
 *
 * A clip whose last frame doesn't match its first shows a jump at every loop. To hide it, the clip
 * is played twice over: when `fade` seconds are left, a second copy starts from the beginning and
 * fades in over the first, so the end dissolves into the start. This is how much of the second copy
 * shows: nothing until `fade` seconds remain, then rising evenly to all of it at the very end.
 */
export function crossfadeOpacity(secondsLeft: number, fade: number): number {
  if (!(fade > 0)) return 0;
  return Math.min(1, Math.max(0, 1 - secondsLeft / fade));
}
