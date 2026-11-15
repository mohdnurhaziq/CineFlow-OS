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

/** Total number of framed prints a package includes, across all its lines. */
export function includedPrintCount(lines: { quantity: number }[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export type PricedCartLine = {
  sizePrice: number;
  framePrice: number;
  matPrice: number;
  upgradeAmount: number;
  lineAmount: number;
};

/**
 * What one framed print in a cart costs. A paid print costs its full framed price. An included
 * print costs only the upgrade over its included line (that line's size + frame, no mat), both
 * at the current catalog prices.
 */
export function priceCartLine(p: {
  kind: "INCLUDED" | "PAID";
  sizePrice: number;
  framePrice: number;
  mat: MatBoardType;
  matBoardPrice: number;
  included?: { sizePrice: number; framePrice: number };
}): PricedCartLine {
  const matPrice = p.mat === "NONE" ? 0 : p.matBoardPrice;
  const chosen = framedPrice({ sizePrice: p.sizePrice, framePrice: p.framePrice, mat: p.mat, matBoardPrice: p.matBoardPrice });
  const base = { sizePrice: p.sizePrice, framePrice: p.framePrice, matPrice };
  if (p.kind === "PAID") return { ...base, upgradeAmount: 0, lineAmount: chosen };
  if (!p.included) throw new Error("An included print needs its included line's price.");
  const included = framedPrice({ ...p.included, mat: "NONE", matBoardPrice: p.matBoardPrice });
  const upgrade = upgradeAmount(chosen, included);
  return { ...base, upgradeAmount: upgrade, lineAmount: upgrade };
}

/** Items total and order total (items + the one shipping fee), rounded to cents. */
export function orderTotals(lineAmounts: number[], shippingFee: number): { itemsTotal: number; total: number } {
  const itemsTotal = round2(lineAmounts.reduce((sum, a) => sum + a, 0));
  return { itemsTotal, total: round2(itemsTotal + shippingFee) };
}
