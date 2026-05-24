import { eq, sql } from "drizzle-orm";
import type { DB } from "@taxtrace/db";
import { anomalies as anomaliesTable, entities as entitiesTable } from "@taxtrace/db";
import { detectPriceSpike } from "./price-spike";
import { detectRepeatAwardee } from "./repeat-awardee";
import { detectSoleSource } from "./sole-source";
import { detectTimingCorrelation } from "./timing-correlation";

export interface RunAllResult {
  soleSource: number;
  repeatAwardee: number;
  priceSpike: number;
  timingCorrelation: number;
  entitiesScored: number;
  totalElapsedMs: number;
}

const SEVERITY_SCORE: Record<string, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1.0,
};

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

  // Denormalize: write a per-entity anomaly score so the entity profile UI
  // reflects what the anomalies engine actually found. Without this step,
  // entities.anomaly_score stays at the schema default (0) even when the
  // entity is the primary subject of a HIGH-severity finding.
  // Score = max(severity weight) across all findings touching the entity.
  // First reset every entity to 0 so dropped findings don't leave stale scores.
  await db.update(entitiesTable).set({ anomalyScore: 0 });

  const perEntityMax = new Map<string, number>();
  for (const f of allFindings) {
    const sevWeight = SEVERITY_SCORE[f.severity] ?? 0;
    const touched = new Set<string>([f.primaryEntityId]);
    try {
      const related = JSON.parse(f.relatedEntityIds ?? "[]") as string[];
      for (const id of related) touched.add(id);
    } catch {
      /* malformed JSON — skip related */
    }
    for (const id of touched) {
      const prev = perEntityMax.get(id) ?? 0;
      if (sevWeight > prev) perEntityMax.set(id, sevWeight);
    }
  }

  for (const [entityId, score] of perEntityMax) {
    await db
      .update(entitiesTable)
      .set({ anomalyScore: score })
      .where(eq(entitiesTable.id, entityId));
  }

  return {
    soleSource: soleSource.length,
    repeatAwardee: repeatAwardee.length,
    priceSpike: priceSpike.length,
    timingCorrelation: timingCorrelation.length,
    entitiesScored: perEntityMax.size,
    totalElapsedMs: Date.now() - start,
  };
}
