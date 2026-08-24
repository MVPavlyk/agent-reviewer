import React from "react";
import { s } from "./styles";

/** One metric tile (RECALL / PRECISION / CITATION / TRACES PASSED / COST).
 *  Purely presentational — the caller has already formatted `value`
 *  (formatMetric / formatCost / passLabel) and `delta` (formatDelta), so
 *  `null` never reaches here as "0". `delta` is omitted entirely (not
 *  rendered as empty) when there is no previous batch to compare against. */
export function MetricTile({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{label}</div>
      <div style={s.tileValue}>
        {value}
        {delta != null && <span style={s.tileDelta}>{delta}</span>}
      </div>
    </div>
  );
}
