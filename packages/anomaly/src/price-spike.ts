/**
 * Price-spike detector.
 *
 * For each NAICS code, compute the median contract value. Flag awards
 * that are >10× the median for that code as potential price anomalies.
 * (Crude but effective — real production would use per-PSC + per-region medians.)
 */

import { contracts as contractsTable, entities as entitiesTable } from "@taxtrace/db";
import type { DB, NewAnomaly } from "@taxtrace/db";
import { eq, isNotNull, sql } from "drizzle-orm";
import { newId } from "@taxtrace/utils";

export interface PriceSpikeConfig {
  /** Minimum multiple of median to flag. Default 10x. */
  minMultiple?: number;
  /** NAICS codes need at least this many comparable contracts to compute median. */
  minSampleSize?: number;
  version?: string;
}

export async function detectPriceSpike(
  db: DB,
  config: PriceSpikeConfig = {},
): Promise<NewAnomaly[]> {
  const minMultiple = config.minMultiple ?? 10;
  const minSampleSize = config.minSampleSize ?? 5;
  const version = config.version ?? "v1";

  // 1. Compute median amount per NAICS code (use AVG as cheap proxy — SQLite has no MEDIAN()).
  const medians = await db
    .select({
      naicsCode: contractsTable.naicsCode,
      sampleSize: sql<number>`count(*)`.as("sample_size"),
      avgUsd: sql<number>`avg(${contractsTable.amountUsd})`.as("avg_usd"),
    })
    .from(contractsTable)
    .where(isNotNull(contractsTable.naicsCode))
    .groupBy(contractsTable.naicsCode);

  const medianByNaics = new Map<string, number>();
  for (const row of medians) {
    if (row.naicsCode && row.sampleSize >= minSampleSize) {
      medianByNaics.set(row.naicsCode, row.avgUsd);
    }
  }

  // 2. Find outliers.
  const outliers = await db
    .select({
      id: contractsTable.id,
      recipientId: contractsTable.recipientId,
      agencyId: contractsTable.agencyId,
      amountUsd: contractsTable.amountUsd,
      naicsCode: contractsTable.naicsCode,
      description: contractsTable.description,
      recipientName: entitiesTable.name,
    })
    .from(contractsTable)
    .leftJoin(entitiesTable, eq(contractsTable.recipientId, entitiesTable.id))
    .where(isNotNull(contractsTable.naicsCode));

  const anomalies: NewAnomaly[] = [];
  for (const row of outliers) {
    const baseline = medianByNaics.get(row.naicsCode ?? "");
    if (!baseline) continue;
    const multiple = row.amountUsd / baseline;
    if (multiple < minMultiple) continue;

    anomalies.push({
      id: newId("anomaly"),
      type: "price_spike",
      severity: multiple >= 50 ? "high" : "medium",
      primaryEntityId: row.recipientId,
      relatedEntityIds: JSON.stringify([row.agencyId]),
      evidenceContractIds: JSON.stringify([row.id]),
      evidenceDonationIds: "[]",
      score: Math.min(1, multiple / 100),
      title: `Price anomaly: $${(row.amountUsd / 1e6).toFixed(1)}M vs $${(baseline / 1e6).toFixed(1)}M average for this category`,
      explanation: `Award is ${multiple.toFixed(1)}× higher than the average contract in NAICS ${row.naicsCode}.\nAmount: $${row.amountUsd.toLocaleString()}.\nCategory average: $${baseline.toLocaleString()}.\nThis could reflect a legitimately larger/more complex scope — or unusual pricing. Worth comparing to similar awards.`,
      amountUsd: row.amountUsd,
      detectedAt: new Date(),
      detectorVersion: `price_spike_${version}`,
      reviewedAt: null,
      reviewerNote: null,
    });
  }

  return anomalies;
}
