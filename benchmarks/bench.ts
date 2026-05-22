#!/usr/bin/env bun
/**
 * TaxTrace benchmarks.
 *
 * Measures:
 *   - Search latency (p50, p95, p99 over 1000 queries)
 *   - Stats endpoint latency
 *   - Anomaly detection throughput
 *
 * Run:
 *   bun benchmarks/bench.ts
 */

import { createDb } from "@taxtrace/db";
import { runAllDetectors } from "@taxtrace/anomaly";

const API = process.env.API_URL ?? "http://localhost:8787";

async function timeOp(name: string, op: () => Promise<unknown>, n = 100): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    await op();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(n * 0.5)] ?? 0;
  const p95 = times[Math.floor(n * 0.95)] ?? 0;
  const p99 = times[Math.floor(n * 0.99)] ?? 0;
  const mean = times.reduce((s, t) => s + t, 0) / n;
  console.log(
    `  ${name.padEnd(28)}  n=${n}  mean=${mean.toFixed(1)}ms  p50=${p50.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  p99=${p99.toFixed(1)}ms`,
  );
  return times;
}

async function main() {
  console.log("\n🏁 TaxTrace benchmarks\n");
  console.log("=== API latency ===");

  await timeOp("GET /stats", () => fetch(`${API}/stats`).then((r) => r.json()), 50);
  await timeOp("GET /search?q=lockheed", () =>
    fetch(`${API}/search?q=lockheed`).then((r) => r.json()),
  );
  await timeOp("GET /search?q=boeing", () =>
    fetch(`${API}/search?q=boeing`).then((r) => r.json()),
  );
  await timeOp("GET /anomalies", () => fetch(`${API}/anomalies?limit=50`).then((r) => r.json()), 50);

  console.log("\n=== DB metrics ===");
  const db = createDb();
  const contractsRow = db.run("SELECT count(*) as n FROM contracts" as any) as any;
  console.log("  contracts:", contractsRow);

  const entitiesRow = db.run("SELECT count(*) as n FROM entities" as any) as any;
  console.log("  entities:", entitiesRow);

  console.log("\n=== Anomaly detection ===");
  const start = Date.now();
  const result = await runAllDetectors(db);
  const totalElapsed = Date.now() - start;
  console.log(`  total: ${totalElapsed}ms`);
  console.log(`    sole_source:        ${result.soleSource}`);
  console.log(`    repeat_awardee:     ${result.repeatAwardee}`);
  console.log(`    price_spike:        ${result.priceSpike}`);
  console.log(`    timing_correlation: ${result.timingCorrelation}`);

  console.log("\n✅ Benchmarks complete\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
