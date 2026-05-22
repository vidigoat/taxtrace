/**
 * Sole-source contract detector.
 *
 * Why this matters: federal law generally requires competitive bidding.
 * Sole-source (no-bid) contracts above $250K are red flags unless properly
 * justified. This detector flags large sole-source awards for investigation.
 */

import { contracts as contractsTable, entities as entitiesTable } from "@taxtrace/db";
import type { DB, NewAnomaly } from "@taxtrace/db";
import { eq, and, gte, or, like } from "drizzle-orm";
import { newId } from "@taxtrace/utils";

export const SOLE_SOURCE_THRESHOLD_USD = 250_000;

export interface SoleSourceConfig {
  /** Minimum amount to flag. Default $250,000 (federal threshold). */
  minAmountUsd?: number;
  /** Detection version (bumped when algorithm changes). */
  version?: string;
}

/**
 * Scan all contracts in the DB; emit an Anomaly for each sole-source bid
 * above threshold. Returns count of anomalies inserted.
 */
export async function detectSoleSource(
  db: DB,
  config: SoleSourceConfig = {},
): Promise<NewAnomaly[]> {
  const minAmount = config.minAmountUsd ?? SOLE_SOURCE_THRESHOLD_USD;
  const version = config.version ?? "v1";

  const rows = await db
    .select({
      id: contractsTable.id,
      recipientId: contractsTable.recipientId,
      agencyId: contractsTable.agencyId,
      amountUsd: contractsTable.amountUsd,
      awardIdPiid: contractsTable.awardIdPiid,
      description: contractsTable.description,
      signedDate: contractsTable.signedDate,
      competitionExtent: contractsTable.competitionExtent,
      recipientName: entitiesTable.name,
    })
    .from(contractsTable)
    .leftJoin(entitiesTable, eq(contractsTable.recipientId, entitiesTable.id))
    .where(
      and(
        gte(contractsTable.amountUsd, minAmount),
        or(
          like(contractsTable.competitionExtent, "%Sole Source%"),
          like(contractsTable.competitionExtent, "%Not Competed%"),
          like(contractsTable.competitionExtent, "%No Competition%"),
        ),
      ),
    );

  return rows.map((row) => {
    const sev = scoreSeverity(row.amountUsd);
    const desc = row.description?.slice(0, 200) ?? "(no description)";

    return {
      id: newId("anomaly"),
      type: "sole_source",
      severity: sev,
      primaryEntityId: row.recipientId,
      relatedEntityIds: JSON.stringify([row.agencyId]),
      evidenceContractIds: JSON.stringify([row.id]),
      evidenceDonationIds: "[]",
      score: Math.min(1, row.amountUsd / 1_000_000_000),
      title: `Sole-source contract: ${row.recipientName ?? "Unknown"} — $${Math.round(
        row.amountUsd / 1_000_000,
      )}M`,
      explanation: `Award ${row.awardIdPiid} (${desc}) was awarded without competition.\nAmount: $${row.amountUsd.toLocaleString()}.\nCompetition extent: "${row.competitionExtent}".\nSole-source awards above $${minAmount.toLocaleString()} require written justification under FAR 6.303.`,
      amountUsd: row.amountUsd,
      detectedAt: new Date(),
      detectorVersion: `sole_source_${version}`,
      reviewedAt: null,
      reviewerNote: null,
    } satisfies NewAnomaly;
  });
}

function scoreSeverity(amount: number): "low" | "medium" | "high" | "critical" {
  if (amount >= 1_000_000_000) return "critical";
  if (amount >= 100_000_000) return "high";
  if (amount >= 10_000_000) return "medium";
  return "low";
}
