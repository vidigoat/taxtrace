/**
 * AWS Lambda handler for the TaxTrace API.
 *
 * Runs Hono via the AWS Lambda adapter. The SQLite database is bundled into
 * the deployment package — Lambda copies it to /var/task/taxtrace.db on
 * cold start, and we open it read-only.
 *
 * Pay-as-you-go: Lambda only runs when there's a request. Idle = $0.
 */

import path from "node:path";
import Database from "better-sqlite3";
import { Hono } from "hono";
import { type LambdaEvent, handle } from "hono/aws-lambda";
import { cors } from "hono/cors";

// Locate the SQLite DB inside the Lambda package.
// In production, our deploy script copies taxtrace.db next to this handler.
const DB_PATH = process.env.DATABASE_PATH ?? path.join(__dirname, "taxtrace.db");

// Single connection — Lambda reuses warm container, no need for pool.
let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (_db) return _db;
  // Lambda /var/task is read-only. Open the DB read-only, no WAL.
  _db = new Database(DB_PATH, { readonly: true });
  return _db;
}

const app = new Hono();
app.use("*", cors({ origin: "*", maxAge: 600 }));

// ───────────────────────────────────────────────────────────────────────────
// Routes (raw SQL via better-sqlite3 — no Drizzle layer needed at runtime,
// keeps the bundle small and dependency-light)
// ───────────────────────────────────────────────────────────────────────────

app.get("/", (c) => c.json({ name: "TaxTrace API on Lambda", version: "0.1.0", status: "ok" }));

app.get("/health", (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.get("/stats", (c) => {
  const db = getDb();
  const contractsRow = db
    .prepare("SELECT count(*) as count, sum(amount_usd) as sumUsd FROM contracts")
    .get() as { count: number; sumUsd: number | null };
  const donationsRow = db
    .prepare("SELECT count(*) as count, sum(amount_usd) as sumUsd FROM donations")
    .get() as { count: number; sumUsd: number | null };
  const entitiesRow = db.prepare("SELECT count(*) as count FROM entities").get() as {
    count: number;
  };
  const anomaliesRow = db
    .prepare("SELECT count(*) as count, sum(amount_usd) as sumUsd FROM anomalies")
    .get() as { count: number; sumUsd: number | null };

  const topRecipients = db
    .prepare(
      "SELECT id, name, total_contracts_received_usd as totalUsd FROM entities ORDER BY total_contracts_received_usd DESC LIMIT 10",
    )
    .all();

  const recentAnomalies = db
    .prepare(
      "SELECT id, type, severity, title, detected_at as detectedAt, amount_usd as amountUsd FROM anomalies ORDER BY detected_at DESC LIMIT 5",
    )
    .all();

  return c.json({
    contracts: { count: contractsRow.count, totalUsd: contractsRow.sumUsd ?? 0 },
    donations: { count: donationsRow.count, totalUsd: donationsRow.sumUsd ?? 0 },
    entities: { count: entitiesRow.count },
    anomalies: { count: anomaliesRow.count, flaggedUsd: anomaliesRow.sumUsd ?? 0 },
    topRecipients,
    recentAnomalies,
  });
});

app.get("/search", (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  if (!q || q.length < 2) {
    return c.json({ query: q, hits: [], total: 0, tookMs: 0 });
  }
  const start = Date.now();
  const db = getDb();
  const pattern = `%${q.toLowerCase()}%`;
  const hits = db
    .prepare(
      `SELECT id, type, name, total_contracts_received_usd as totalUsd
       FROM entities
       WHERE canonical_name LIKE ? OR lower(name) LIKE ? OR lower(description) LIKE ?
       ORDER BY total_contracts_received_usd DESC
       LIMIT ?`,
    )
    .all(pattern, pattern, pattern, limit) as Array<{ id: string; type: string; name: string }>;

  return c.json({
    query: q,
    hits: hits.map((h) => ({
      entity: { id: h.id, type: h.type, name: h.name },
      score: 1,
      matchedFields: ["name"],
    })),
    total: hits.length,
    tookMs: Date.now() - start,
  });
});

app.get("/entities/:id", (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const entity = db.prepare("SELECT * FROM entities WHERE id = ?").get(id);
  if (!entity) return c.json({ error: "Entity not found" }, 404);

  const topContracts = db
    .prepare(
      "SELECT id, award_id_piid as awardIdPiid, description, amount_usd as amountUsd, signed_date as signedDate FROM contracts WHERE recipient_id = ? ORDER BY amount_usd DESC LIMIT 20",
    )
    .all(id);

  const donationsMade = db
    .prepare(
      "SELECT id, amount_usd as amountUsd, contribution_date as contributionDate FROM donations WHERE donor_id = ? ORDER BY amount_usd DESC LIMIT 20",
    )
    .all(id);

  const donationsReceived = db
    .prepare(
      "SELECT id, amount_usd as amountUsd, contribution_date as contributionDate FROM donations WHERE recipient_id = ? ORDER BY amount_usd DESC LIMIT 20",
    )
    .all(id);

  // Map snake_case to camelCase for the entity row
  const e = entity as Record<string, unknown>;
  const camel = {
    id: e.id,
    type: e.type,
    name: e.name,
    description: e.description,
    totalContractsReceivedUsd: e.total_contracts_received_usd,
    totalDonationsReceivedUsd: e.total_donations_received_usd,
    totalDonationsMadeUsd: e.total_donations_made_usd,
    anomalyScore: e.anomaly_score,
  };

  return c.json({ entity: camel, topContracts, donationsMade, donationsReceived });
});

app.get("/anomalies", (c) => {
  const db = getDb();
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const rows = db
    .prepare(
      `SELECT a.*, e.id as ent_id, e.name as ent_name, e.type as ent_type
       FROM anomalies a
       LEFT JOIN entities e ON a.primary_entity_id = e.id
       ORDER BY a.detected_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as Array<Record<string, unknown>>;

  const anomalies = rows.map((r) => ({
    anomaly: {
      id: r.id,
      type: r.type,
      severity: r.severity,
      primaryEntityId: r.primary_entity_id,
      score: r.score,
      title: r.title,
      explanation: r.explanation,
      amountUsd: r.amount_usd,
      detectedAt: r.detected_at,
    },
    primaryEntity: r.ent_id ? { id: r.ent_id, name: r.ent_name, type: r.ent_type } : null,
  }));

  return c.json({ anomalies, limit, offset });
});

app.get("/network/:id", (c) => {
  const db = getDb();
  const rootId = c.req.param("id");
  const depth = Math.min(Number(c.req.query("depth") ?? 2), 4);
  const maxNodes = Math.min(Number(c.req.query("maxNodes") ?? 200), 500);

  const visited = new Set<string>([rootId]);
  const allEdges: Array<{ from: string; to: string; kind: string; weight: number }> = [];
  let frontier: string[] = [rootId];

  for (let d = 0; d < depth && visited.size < maxNodes; d++) {
    if (frontier.length === 0) break;
    const placeholders = frontier.map(() => "?").join(",");
    const layer = db
      .prepare(
        `SELECT from_id, to_id, kind, weight_usd FROM edges
         WHERE from_id IN (${placeholders}) OR to_id IN (${placeholders})
         ORDER BY weight_usd DESC LIMIT ?`,
      )
      .all(...frontier, ...frontier, maxNodes) as Array<{
      from_id: string;
      to_id: string;
      kind: string;
      weight_usd: number;
    }>;

    const next = new Set<string>();
    for (const e of layer) {
      allEdges.push({ from: e.from_id, to: e.to_id, kind: e.kind, weight: e.weight_usd });
      for (const id of [e.from_id, e.to_id]) {
        if (!visited.has(id)) {
          visited.add(id);
          next.add(id);
          if (visited.size >= maxNodes) break;
        }
      }
    }
    frontier = Array.from(next);
  }

  if (visited.size === 0) {
    return c.json({ rootId, depth, nodes: [], edges: [] });
  }

  const placeholders = Array.from(visited)
    .map(() => "?")
    .join(",");
  const nodes = db
    .prepare(
      `SELECT id, type, name, anomaly_score, total_contracts_received_usd FROM entities WHERE id IN (${placeholders})`,
    )
    .all(...Array.from(visited)) as Array<{
    id: string;
    type: string;
    name: string;
    anomaly_score: number;
    total_contracts_received_usd: number;
  }>;

  return c.json({
    rootId,
    depth,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.name,
      type: n.type,
      size: Math.log10((n.total_contracts_received_usd ?? 0) + 10) * 4,
      color: colorForType(n.type, n.anomaly_score),
      anomalyScore: n.anomaly_score,
    })),
    edges: allEdges,
  });
});

function colorForType(type: string, anomaly: number): string {
  if (anomaly >= 0.7) return "#ef4444";
  if (anomaly >= 0.4) return "#f59e0b";
  return (
    {
      company: "#3b82f6",
      person: "#a855f7",
      agency: "#10b981",
      pac: "#f97316",
      committee: "#06b6d4",
      subagency: "#6366f1",
    }[type] ?? "#9ca3af"
  );
}

// Export the Lambda handler.
export const handler = handle(app);
// Re-export type to satisfy TS bundlers
export type { LambdaEvent };
