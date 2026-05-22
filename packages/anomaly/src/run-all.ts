import type { DB } from "@taxtrace/db";
import { anomalies as anomaliesTable } from "@taxtrace/db";
import { detectSoleSource } from "./sole-source";
import { detectRepeatAwardee } from "./repeat-awardee";
import { detectPriceSpike } from "./price-spike";
import { detectTimingCorrelation } from "./timing-correlation";

export interface RunAllResult {
  soleSource: number;
  repeatAwardee: number;
  priceSpike: number;
  timingCorrelation: number;
  totalElapsedMs: number;
}

/**
 * Run all enabled detectors and replace findings in the DB.
 *
 * Idempotent by design: clears the anomalies table before inserting fresh
 * findings, so re-running this multiple times produces N rows, not N×runs.
 * (Earlier version inserted on every run, creating duplicates.)
 *
 * In production with multiple detector versions running concurrently, swap
 * this for `delete where detector_version IN (versions touched this run)` —
 * but at our scale, full-clear is simpler and unambiguous.
 */
export async function runAllDetectors(db: DB): Promise<RunAllResult> {
  const start = Date.now();

  // Clear stale anomalies before re-detecting so re-runs are idempotent.
  await db.delete(anomaliesTable);

  const [soleSource, repeatAwardee, priceSpike, timingCorrelation] = await Promise.all([
    detectSoleSource(db),
    detectRepeatAwardee(db),
    detectPriceSpike(db),
    detectTimingCorrelation(db),
  ]);

  const allFindings = [...soleSource, ...repeatAwardee, ...priceSpike, ...timingCorrelation];

  if (allFindings.length > 0) {
    // Insert in chunks to avoid SQLite "too many SQL variables" error
    const chunkSize = 100;
    for (let i = 0; i < allFindings.length; i += chunkSize) {
      const chunk = allFindings.slice(i, i + chunkSize);
      await db.insert(anomaliesTable).values(chunk);
    }
  }

  return {
    soleSource: soleSource.length,
    repeatAwardee: repeatAwardee.length,
    priceSpike: priceSpike.length,
    timingCorrelation: timingCorrelation.length,
    totalElapsedMs: Date.now() - start,
  };
}
