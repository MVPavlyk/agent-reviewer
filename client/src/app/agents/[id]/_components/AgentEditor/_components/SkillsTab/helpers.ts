/** Move `arr[from]` to index `to` — pure, returns a new array. No-op (returns
 *  the same array) when `to` is out of bounds, so callers can compute
 *  `index - 1` / `index + 1` at the array ends without a separate guard. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}
