#!/usr/bin/env bun
/**
 * Pull recent federal contracts from USAspending and load them into our DB.
 *
 * Usage:
 *   bun src/jobs/scrape-usaspending.ts [--year 2025] [--max 500] [--min 1000000]
 *
 * The defaults pull the top-500 highest-value contracts from the most recent
 * complete fiscal year — enough to demo the entire pipeline.
 */

import { contracts, createDb, sql } from "@taxtrace/db";
import type { NewContract } from "@taxtrace/db";
import { UsaSpendingClient } from "@taxtrace/scrapers";
import { newId, parseDate, parseMoney } from "@taxtrace/utils";
import { EntityCache } from "../lib/entity-cache";

const args = parseArgs(process.argv.slice(2));
const fiscalYear = Number(args.year ?? new Date().getFullYear());
const max = Number(args.max ?? 500);
const minAmount = Number(args.min ?? 1_000_000);

console.log(
  `📥 Pulling top ${max} contracts from FY${fiscalYear} (min $${minAmount.toLocaleString()})…`,
);

const db = createDb();
const client = new UsaSpendingClient();
const cache = new EntityCache(db);

const start = Date.now();
let count = 0;
let totalUsd = 0;
const batch: NewContract[] = [];

for await (const row of client.streamTopContracts({ fiscalYear, minAmount, maxResults: max })) {
  const r = row as Record<string, unknown>;
  const recipientName = (r["Recipient Name"] as string | null) ?? "(Unknown recipient)";
  const agencyName = (r["Awarding Agency"] as string | null) ?? "(Unknown agency)";
  const amount = (r["Award Amount"] as number | null) ?? 0;

  const recipientId = await cache.getOrCreate(recipientName, {
    type: "company",
    ueiId: (r["Recipient UEI"] as string | null) ?? null,
    source: "usaspending",
  });

  const agencyId = await cache.getOrCreate(agencyName, {
    type: "agency",
    source: "usaspending",
  });

  const piid =
    (r.generated_internal_id as string | undefined) ??
    (r.award_id as string | undefined) ??
    (r["Award ID"] as string | undefined) ??
    newId("piid");
  const signedDate = parseDate(r["Start Date"] as string | null | undefined) ?? new Date();

  batch.push({
    id: newId("contract"),
    recipientId,
    agencyId,
    awardIdPiid: piid,
    awardType: (r["Contract Award Type"] as string | null) ?? "Definitive Contract",
    amountUsd: parseMoney(amount),
    obligationsToDate: (r["Total Outlays"] as number | null) ?? null,
    signedDate,
    startDate: parseDate(r["Start Date"] as string | null | undefined),
    endDate: parseDate(r["End Date"] as string | null | undefined),
    description: (r.Description as string | null) ?? null,
    competitionExtent: null,
    isSetAside: false,
    performanceState: null,
    source: "usaspending",
    sourceUpdatedAt: new Date(),
    ingestedAt: new Date(),
  });

  count += 1;
  totalUsd += parseMoney(amount);

  if (batch.length >= 50) {
    (await db.insert(contracts).values(batch).onConflictDoNothing?.()) ??
      (await db.insert(contracts).values(batch));
    batch.length = 0;
  }

  if (count % 100 === 0) {
    const rps = count / ((Date.now() - start) / 1000);
    console.log(
      `  …${count} contracts ($${(totalUsd / 1e9).toFixed(1)}B total, ${rps.toFixed(1)} rec/s)`,
    );
  }
}

if (batch.length > 0) {
  await db.insert(contracts).values(batch);
}

// Update denormalized entity totals
console.log("📊 Updating entity totals…");
await db.run(sql`
  UPDATE entities
  SET total_contracts_received_usd = (
    SELECT COALESCE(SUM(amount_usd), 0)
    FROM contracts
    WHERE contracts.recipient_id = entities.id
  )
`);

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`✅ Done: ${count} contracts in ${elapsed}s ($${(totalUsd / 1e9).toFixed(2)}B total)`);

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        out[key] = value;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}
