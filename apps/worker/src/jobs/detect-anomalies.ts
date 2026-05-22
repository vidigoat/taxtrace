#!/usr/bin/env bun
/**
 * Run all anomaly detectors and write findings to the DB.
 *
 * Usage:
 *   bun src/jobs/detect-anomalies.ts
 */

import { runAllDetectors } from "@taxtrace/anomaly";
import { createDb } from "@taxtrace/db";

const db = createDb();
console.log("🔎 Running anomaly detection…");

const start = Date.now();
const result = await runAllDetectors(db);

console.log("✅ Anomaly detection complete:");
console.log(`   Sole-source:         ${result.soleSource}`);
console.log(`   Repeat awardee:      ${result.repeatAwardee}`);
console.log(`   Price spike:         ${result.priceSpike}`);
console.log(`   Timing correlation:  ${result.timingCorrelation}`);
console.log(`   Total time:          ${((Date.now() - start) / 1000).toFixed(2)}s`);
