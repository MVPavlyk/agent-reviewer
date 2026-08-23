import type { LabelRow } from './repository';

export interface LabelScore {
  name: string;
  score: number;
  stale: boolean;
}

export function toLabelScore(row: LabelRow, score: number, stale: boolean): LabelScore {
  return { name: row.name, score, stale };
}
