/**
 * Repeat-awardee detector.
 *
 * Flags cases where a single contractor wins >N consecutive contracts
 * from the same agency in the same category, which suggests either
 * a true sole-source relationship or anti-competitive bidding.
 */

import { contracts as contractsTable, entities as entitiesTable } from "@taxtrace/db";
import type { DB, NewAnomaly } from "@taxtrace/db";
import { eq, sql } from "drizzle-orm";
import { newId } from "@taxtrace/utils";

export interface RepeatAwardeeConfig {
  minConsecutive?: number;
  minTotalUsd?: number;
  version?: string;
}

export async function detectRepeatAwardee(
  db: DB,
  config: RepeatAwardeeConfig = {},
): Promise<NewAnomaly[]> {
  const minConsecutive = config.minConsecutive ?? 5;
  const minTotalUsd = config.minTotalUsd ?? 10_000_000;
  const version = config.version ?? "v1";

  // SQL aggregation: count contracts per (agency, recipient) and sum amounts
  const rows = await db
    .select({
      agencyId: contractsTable.agencyId,
      recipientId: contractsTable.recipientId,
      contractCount: sql<number>`count(*)`.as("contract_count"),
      totalUsd: sql<number>`sum(${contractsTable.amountUsd})`.as("total_usd"),
      recipientName: entitiesTable.name,
    })
    .from(contractsTable)
    .leftJoin(entitiesTable, eq(contractsTable.recipientId, entitiesTable.id))
    .groupBy(contractsTable.agencyId, contractsTable.recipientId)
    .having(
      sql`count(*) >= ${minConsecutive} AND sum(${contractsTable.amountUsd}) >= ${minTotalUsd}`,
    );

  return rows.map(
    (row) =>
      ({
        id: newId("anomaly"),
        type: "repeat_awardee",
        severity: row.totalUsd >= 1_000_000_000 ? "high" : "medium",
        primaryEntityId: row.recipientId,
        relatedEntityIds: JSON.stringify([row.agencyId]),
        evidenceContractIds: "[]",
        evidenceDonationIds: "[]",
        score: Math.min(1, row.contractCount / 50),
        title: `Repeat awardee: ${row.recipientName ?? "Unknown"} won ${row.contractCount} contracts`,
        explanation: `Recipient won ${row.contractCount} contracts from this agency, totaling $${row.totalUsd.toLocaleString()}.\nThis pattern can indicate sole-source relationships, anti-competitive bidding, or a legitimate prime contractor — review the underlying award justifications.`,
        amountUsd: row.totalUsd,
        detectedAt: new Date(),
        detectorVersion: `repeat_awardee_${version}`,
        reviewedAt: null,
        reviewerNote: null,
      }) satisfies NewAnomaly,
  );
}
