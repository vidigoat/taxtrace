import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as schema from "@taxtrace/db";
import { newId } from "@taxtrace/utils";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { detectSoleSource } from "../sole-source";

let db: ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  db = drizzle(sqlite, { schema });

  // Create schema manually for in-memory test
  sqlite.exec(`
    CREATE TABLE entities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      uei_id TEXT,
      duns TEXT,
      ein TEXT,
      cik TEXT,
      fec_id TEXT,
      bioguide_id TEXT,
      wikidata_qid TEXT,
      description TEXT,
      country_code TEXT,
      state TEXT,
      zip TEXT,
      industry TEXT,
      founded_year INTEGER,
      total_contracts_received_usd REAL NOT NULL DEFAULT 0,
      total_donations_received_usd REAL NOT NULL DEFAULT 0,
      total_donations_made_usd REAL NOT NULL DEFAULT 0,
      anomaly_score REAL NOT NULL DEFAULT 0,
      sources TEXT NOT NULL DEFAULT '[]',
      first_seen_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL REFERENCES entities(id),
      agency_id TEXT NOT NULL REFERENCES entities(id),
      award_id_piid TEXT NOT NULL,
      parent_award_id TEXT,
      award_type TEXT NOT NULL,
      contract_type TEXT,
      amount_usd REAL NOT NULL,
      base_and_all_options_usd REAL,
      obligations_to_date REAL,
      signed_date INTEGER NOT NULL,
      start_date INTEGER,
      end_date INTEGER,
      description TEXT,
      naics_code TEXT,
      psc_code TEXT,
      competition_extent TEXT,
      number_of_offers_received INTEGER,
      is_set_aside INTEGER NOT NULL DEFAULT 0,
      set_aside_type TEXT,
      performance_state TEXT,
      performance_city TEXT,
      performance_country TEXT,
      source TEXT NOT NULL,
      source_updated_at INTEGER NOT NULL,
      ingested_at INTEGER NOT NULL
    );
  `);

  const now = new Date();
  const recipientId = newId("ent");
  const agencyId = newId("ent");

  await db.insert(schema.entities).values([
    {
      id: recipientId,
      type: "company",
      name: "Test Contractor Corp",
      canonicalName: "test contractor",
      sources: "[]",
      firstSeenAt: now,
      updatedAt: now,
    },
    {
      id: agencyId,
      type: "agency",
      name: "Test Agency",
      canonicalName: "test agency",
      sources: "[]",
      firstSeenAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(schema.contracts).values([
    {
      id: newId("contract"),
      recipientId,
      agencyId,
      awardIdPiid: "TESTSOLE1",
      awardType: "Definitive Contract",
      amountUsd: 5_000_000,
      signedDate: now,
      competitionExtent: "Not Competed",
      source: "test",
      sourceUpdatedAt: now,
      ingestedAt: now,
    },
    {
      id: newId("contract"),
      recipientId,
      agencyId,
      awardIdPiid: "TESTNORMAL1",
      awardType: "Definitive Contract",
      amountUsd: 3_000_000,
      signedDate: now,
      competitionExtent: "Full and Open",
      source: "test",
      sourceUpdatedAt: now,
      ingestedAt: now,
    },
    {
      id: newId("contract"),
      recipientId,
      agencyId,
      awardIdPiid: "TESTSMALL",
      awardType: "Definitive Contract",
      amountUsd: 50_000, // below threshold
      signedDate: now,
      competitionExtent: "Sole Source",
      source: "test",
      sourceUpdatedAt: now,
      ingestedAt: now,
    },
  ]);
});

afterAll(() => {
  sqlite.close();
});

describe("detectSoleSource", () => {
  it("flags sole-source above threshold", async () => {
    const findings = await detectSoleSource(db as any);
    expect(findings.length).toBe(1);
    expect(findings[0]?.type).toBe("sole_source");
  });

  it("respects minAmountUsd config", async () => {
    const findings = await detectSoleSource(db as any, { minAmountUsd: 100_000_000 });
    expect(findings.length).toBe(0);
  });
});
