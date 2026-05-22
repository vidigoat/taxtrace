/**
 * TaxTrace database schema (Drizzle + SQLite).
 *
 * Design notes:
 *   - One unified `entities` table for everything (companies, people, agencies,
 *     PACs). This lets us put a contract from DoD → Lockheed on the same graph
 *     as a donation from Lockheed Exec → Senator.
 *   - `contracts` and `donations` are the two big fact tables.
 *   - `edges` is a denormalized adjacency list, rebuilt by the worker. Lets us
 *     do graph queries with simple recursive CTEs instead of needing AGE/Neo4j
 *     for the v1.
 *   - `anomalies` is append-only — each detection run inserts new rows.
 *
 * For production scale (1B+ donations) we'd swap SQLite for Postgres on Neon
 * and add Apache AGE for sub-100ms 5-hop graph queries. SQLite is plenty
 * fast for the first 10M rows and lets the demo run on a Vercel build.
 */

import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ============================================================================
// entities — every actor in the federal spending graph
// ============================================================================
export const entities = sqliteTable(
  "entities",
  {
    id: text("id").primaryKey(),
    type: text("type", {
      enum: ["company", "person", "agency", "pac", "committee", "subagency"],
    }).notNull(),
    name: text("name").notNull(),
    canonicalName: text("canonical_name").notNull(),

    // External IDs (any may be null; we match across sources)
    ueiId: text("uei_id"),
    duns: text("duns"),
    ein: text("ein"),
    cik: text("cik"),
    fecId: text("fec_id"),
    bioguideId: text("bioguide_id"),
    wikidataQid: text("wikidata_qid"),

    // Metadata
    description: text("description"),
    countryCode: text("country_code"),
    state: text("state"),
    zip: text("zip"),
    industry: text("industry"),
    foundedYear: integer("founded_year"),

    // Denormalized metrics (rebuilt by worker)
    totalContractsReceivedUsd: real("total_contracts_received_usd").notNull().default(0),
    totalDonationsReceivedUsd: real("total_donations_received_usd").notNull().default(0),
    totalDonationsMadeUsd: real("total_donations_made_usd").notNull().default(0),
    anomalyScore: real("anomaly_score").notNull().default(0),

    // Provenance
    sources: text("sources").notNull().default("[]"), // JSON-encoded string[]
    firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    nameIdx: index("entities_canonical_name_idx").on(t.canonicalName),
    typeIdx: index("entities_type_idx").on(t.type),
    ueiIdx: index("entities_uei_idx").on(t.ueiId),
    fecIdx: index("entities_fec_idx").on(t.fecId),
  }),
);

// ============================================================================
// contracts — federal awards
// ============================================================================
export const contracts = sqliteTable(
  "contracts",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => entities.id),
    agencyId: text("agency_id")
      .notNull()
      .references(() => entities.id),

    awardIdPiid: text("award_id_piid").notNull(),
    parentAwardId: text("parent_award_id"),
    awardType: text("award_type").notNull(),
    contractType: text("contract_type"),

    amountUsd: real("amount_usd").notNull(),
    baseAndAllOptionsUsd: real("base_and_all_options_usd"),
    obligationsToDate: real("obligations_to_date"),

    signedDate: integer("signed_date", { mode: "timestamp" }).notNull(),
    startDate: integer("start_date", { mode: "timestamp" }),
    endDate: integer("end_date", { mode: "timestamp" }),

    description: text("description"),
    naicsCode: text("naics_code"),
    pscCode: text("psc_code"),

    competitionExtent: text("competition_extent"),
    numberOfOffersReceived: integer("number_of_offers_received"),
    isSetAside: integer("is_set_aside", { mode: "boolean" }).notNull().default(false),
    setAsideType: text("set_aside_type"),

    performanceState: text("performance_state"),
    performanceCity: text("performance_city"),
    performanceCountry: text("performance_country"),

    source: text("source").notNull(),
    sourceUpdatedAt: integer("source_updated_at", { mode: "timestamp" }).notNull(),
    ingestedAt: integer("ingested_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    recipientIdx: index("contracts_recipient_idx").on(t.recipientId),
    agencyIdx: index("contracts_agency_idx").on(t.agencyId),
    signedDateIdx: index("contracts_signed_date_idx").on(t.signedDate),
    amountIdx: index("contracts_amount_idx").on(t.amountUsd),
    competitionIdx: index("contracts_competition_idx").on(t.competitionExtent),
  }),
);

// ============================================================================
// donations — campaign finance
// ============================================================================
export const donations = sqliteTable(
  "donations",
  {
    id: text("id").primaryKey(),
    donorId: text("donor_id")
      .notNull()
      .references(() => entities.id),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => entities.id),

    fecTransactionId: text("fec_transaction_id"),
    fecImageNumber: text("fec_image_number"),
    cycle: integer("cycle").notNull(),

    amountUsd: real("amount_usd").notNull(),
    contributionDate: integer("contribution_date", { mode: "timestamp" }).notNull(),

    transactionType: text("transaction_type"),
    donorEmployer: text("donor_employer"),
    donorOccupation: text("donor_occupation"),
    isEarmarked: integer("is_earmarked", { mode: "boolean" }).notNull().default(false),
    memo: text("memo"),

    source: text("source").notNull().default("openfec"),
    ingestedAt: integer("ingested_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    donorIdx: index("donations_donor_idx").on(t.donorId),
    recipientIdx: index("donations_recipient_idx").on(t.recipientId),
    cycleIdx: index("donations_cycle_idx").on(t.cycle),
    dateIdx: index("donations_date_idx").on(t.contributionDate),
  }),
);

// ============================================================================
// edges — denormalized adjacency list, rebuilt by worker
// ============================================================================
export const edges = sqliteTable(
  "edges",
  {
    id: text("id").primaryKey(),
    fromId: text("from_id")
      .notNull()
      .references(() => entities.id),
    toId: text("to_id")
      .notNull()
      .references(() => entities.id),
    kind: text("kind", {
      enum: ["contract", "donation", "lobbies", "employs", "subsidiary", "officer"],
    }).notNull(),
    weightUsd: real("weight_usd").notNull().default(0),
    count: integer("count").notNull().default(1),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    fromIdx: index("edges_from_idx").on(t.fromId),
    toIdx: index("edges_to_idx").on(t.toId),
    kindIdx: index("edges_kind_idx").on(t.kind),
    weightIdx: index("edges_weight_idx").on(t.weightUsd),
  }),
);

// ============================================================================
// anomalies — append-only detection results
// ============================================================================
export const anomalies = sqliteTable(
  "anomalies",
  {
    id: text("id").primaryKey(),
    type: text("type", {
      enum: [
        "sole_source",
        "shell_llc",
        "price_spike",
        "timing_correlation",
        "network_cluster",
        "repeat_awardee",
        "split_award",
        "post_employment",
      ],
    }).notNull(),
    severity: text("severity", {
      enum: ["low", "medium", "high", "critical"],
    }).notNull(),

    primaryEntityId: text("primary_entity_id")
      .notNull()
      .references(() => entities.id),
    relatedEntityIds: text("related_entity_ids").notNull().default("[]"), // JSON
    evidenceContractIds: text("evidence_contract_ids").notNull().default("[]"), // JSON
    evidenceDonationIds: text("evidence_donation_ids").notNull().default("[]"), // JSON

    score: real("score").notNull(),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    amountUsd: real("amount_usd"),

    detectedAt: integer("detected_at", { mode: "timestamp" }).notNull(),
    detectorVersion: text("detector_version").notNull(),
    reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
    reviewerNote: text("reviewer_note"),
  },
  (t) => ({
    typeIdx: index("anomalies_type_idx").on(t.type),
    severityIdx: index("anomalies_severity_idx").on(t.severity),
    entityIdx: index("anomalies_entity_idx").on(t.primaryEntityId),
    detectedIdx: index("anomalies_detected_idx").on(t.detectedAt),
  }),
);

// ============================================================================
// Type exports
// ============================================================================
export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;
export type Donation = typeof donations.$inferSelect;
export type NewDonation = typeof donations.$inferInsert;
export type Edge = typeof edges.$inferSelect;
export type NewEdge = typeof edges.$inferInsert;
export type Anomaly = typeof anomalies.$inferSelect;
export type NewAnomaly = typeof anomalies.$inferInsert;
