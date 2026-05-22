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

/** Run all enabled detectors and insert findings into the DB. */
export async function runAllDetectors(db: DB): Promise<RunAllResult> {
  const start = Date.now();

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
