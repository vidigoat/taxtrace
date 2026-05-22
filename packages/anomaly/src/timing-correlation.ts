/**
 * Timing-correlation detector.
 *
 * Flags cases where a donation from entity A → committee B is followed
 * within `windowDays` by a contract from agency (linked to B) → A.
 *
 * This is the most contentious detector and the most interesting one.
 * The pattern doesn't prove causation, but it's exactly the kind of
 * journalism lead that investigative reporters look for.
 */

import { contracts as contractsTable, donations as donationsTable, entities as entitiesTable } from "@taxtrace/db";
import type { DB, NewAnomaly } from "@taxtrace/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { newId, daysBetween } from "@taxtrace/utils";

export interface TimingCorrelationConfig {
  /** Window after donation in which contract is "suspicious." Default 90 days. */
  windowDays?: number;
  /** Minimum donation amount to consider. Default $1,000. */
  minDonationUsd?: number;
  /** Minimum contract amount to consider. Default $100,000. */
  minContractUsd?: number;
  version?: string;
}

export async function detectTimingCorrelation(
  db: DB,
  config: TimingCorrelationConfig = {},
): Promise<NewAnomaly[]> {
  const windowDays = config.windowDays ?? 90;
  const minDonationUsd = config.minDonationUsd ?? 1_000;
  const minContractUsd = config.minContractUsd ?? 100_000;
  const version = config.version ?? "v1";

  // Pull all qualifying donations
  const donations = await db
    .select({
      id: donationsTable.id,
      donorId: donationsTable.donorId,
      recipientId: donationsTable.recipientId,
      amountUsd: donationsTable.amountUsd,
      contributionDate: donationsTable.contributionDate,
    })
    .from(donationsTable)
    .where(gte(donationsTable.amountUsd, minDonationUsd));

  const anomalies: NewAnomaly[] = [];

  for (const donation of donations) {
    const windowEnd = new Date(donation.contributionDate.getTime() + windowDays * 86_400_000);

    // Find contracts to this donor (or donor's employer) within the window
    const suspiciousContracts = await db
      .select({
        id: contractsTable.id,
        recipientId: contractsTable.recipientId,
        agencyId: contractsTable.agencyId,
        amountUsd: contractsTable.amountUsd,
        signedDate: contractsTable.signedDate,
        recipientName: entitiesTable.name,
      })
      .from(contractsTable)
      .leftJoin(entitiesTable, eq(contractsTable.recipientId, entitiesTable.id))
      .where(
        and(
          eq(contractsTable.recipientId, donation.donorId),
          gte(contractsTable.signedDate, donation.contributionDate),
          lte(contractsTable.signedDate, windowEnd),
          gte(contractsTable.amountUsd, minContractUsd),
        ),
      );

    for (const contract of suspiciousContracts) {
      const days = daysBetween(donation.contributionDate, contract.signedDate);
      anomalies.push({
        id: newId("anomaly"),
        type: "timing_correlation",
        severity: days <= 30 ? "high" : "medium",
        primaryEntityId: donation.donorId,
        relatedEntityIds: JSON.stringify([donation.recipientId, contract.agencyId]),
        evidenceContractIds: JSON.stringify([contract.id]),
        evidenceDonationIds: JSON.stringify([donation.id]),
        score: Math.max(0, 1 - days / windowDays),
        title: `Timing correlation: donation followed by contract ${days} days later`,
        explanation: `Donation of $${donation.amountUsd.toLocaleString()} from this entity, then $${contract.amountUsd.toLocaleString()} contract ${days} days later.\nThis pattern doesn't prove causation — donors regularly do business with the government — but it's worth investigation when the timing is tight, the amounts are large, or the same pair repeats.`,
        amountUsd: contract.amountUsd,
        detectedAt: new Date(),
        detectorVersion: `timing_correlation_${version}`,
        reviewedAt: null,
        reviewerNote: null,
      });
    }
  }

  return anomalies;
}
