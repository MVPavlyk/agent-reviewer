export const NO_COST = "—";

/** Below $1, keeps 3 significant digits instead of flattening everything to
 *  "$0.01" via toFixed(2). E.g. 0.014 → "$0.014", 0.0013 → "$0.0013". */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return NO_COST;
  if (usd === 0) return "$0.00";

  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;

  const decimals = Math.min(2 - Math.floor(Math.log10(abs)), 20);
  const body = abs.toFixed(decimals).replace(/0+$/, "");
  return `${sign}$${body}`;
}

export function formatTokenTotal(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  if (tokensIn == null && tokensOut == null) return null;
  const total = (tokensIn ?? 0) + (tokensOut ?? 0);
  return `${total.toLocaleString("en-US").replace(/,/g, " ")} tok`;
}
