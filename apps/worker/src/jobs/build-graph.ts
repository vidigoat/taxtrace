#!/usr/bin/env bun
/**
 * Rebuild the `edges` adjacency table from current contracts + donations.
 *
 * Runs after every ingest. Aggregates contracts (agency → recipient)
 * and donations (donor → recipient) into weighted edges so we can do fast
 * graph queries.
 */

import { contracts, createDb, donations, edges, sql } from "@taxtrace/db";
import { newId } from "@taxtrace/utils";

const db = createDb();
const start = Date.now();

console.log("🔗 Rebuilding edge table…");

// Clear existing edges
await db.delete(edges);

// Contract edges: agency → recipient
const contractEdges = await db
  .select({
    fromId: contracts.agencyId,
    toId: contracts.recipientId,
    weightUsd: sql<number>`sum(${contracts.amountUsd})`.as("weight_usd"),
    count: sql<number>`count(*)`.as("count"),
    firstSeen: sql<Date>`min(${contracts.signedDate})`.as("first_seen"),
    lastSeen: sql<Date>`max(${contracts.signedDate})`.as("last_seen"),
  })
  .from(contracts)
  .groupBy(contracts.agencyId, contracts.recipientId);

if (contractEdges.length > 0) {
  const rows = contractEdges.map((e) => ({
    id: newId("edge"),
    fromId: e.fromId,
    toId: e.toId,
    kind: "contract" as const,
    weightUsd: e.weightUsd,
    count: e.count,
    firstSeenAt: new Date(e.firstSeen),
    lastSeenAt: new Date(e.lastSeen),
  }));
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.insert(edges).values(rows.slice(i, i + chunkSize));
  }
}

// Donation edges: donor → recipient
const donationEdges = await db
  .select({
    fromId: donations.donorId,
    toId: donations.recipientId,
    weightUsd: sql<number>`sum(${donations.amountUsd})`.as("weight_usd"),
    count: sql<number>`count(*)`.as("count"),
    firstSeen: sql<Date>`min(${donations.contributionDate})`.as("first_seen"),
    lastSeen: sql<Date>`max(${donations.contributionDate})`.as("last_seen"),
  })
  .from(donations)
  .groupBy(donations.donorId, donations.recipientId);

if (donationEdges.length > 0) {
  const rows = donationEdges.map((e) => ({
    id: newId("edge"),
    fromId: e.fromId,
    toId: e.toId,
    kind: "donation" as const,
    weightUsd: e.weightUsd,
    count: e.count,
    firstSeenAt: new Date(e.firstSeen),
    lastSeenAt: new Date(e.lastSeen),
  }));
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.insert(edges).values(rows.slice(i, i + chunkSize));
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(2);
console.log(
  `✅ Edges rebuilt: ${contractEdges.length} contract + ${donationEdges.length} donation in ${elapsed}s`,
);
