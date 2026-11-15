export type MatBoardType = "NONE" | "WHITE_2INCH" | "OFFWHITE_2INCH";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Price of a framed print: size + frame + (optional) mat board, at the studio's mat price. */
export function framedPrice(p: { sizePrice: number; framePrice: number; mat: MatBoardType; matBoardPrice: number }): number {
  return round2(p.sizePrice + p.framePrice + (p.mat === "NONE" ? 0 : p.matBoardPrice));
}

/** What the client pays on top of an included print when they choose a pricier one. */
export function upgradeAmount(chosen: number, included: number): number {
  return Math.max(0, round2(chosen - included));
}
