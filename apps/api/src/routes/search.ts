import { Hono } from "hono";
import { entities, like, desc, sql, or } from "@taxtrace/db";
import { canonicalName } from "@taxtrace/utils";
import type { Env } from "../index";

export const searchRouter = new Hono<Env>();

/**
 * GET /search?q=<query>
 *
 * Searches across entity names. v1 uses SQL LIKE on canonicalName; v2 would
 * route to Meilisearch for sub-50ms full-text. The interface is the same so
 * we can swap implementations without changing the API contract.
 */
searchRouter.get("/", async (c) => {
  const db = c.var.db;
  const q = (c.req.query("q") ?? "").trim();
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);

  if (!q || q.length < 2) {
    return c.json({ query: q, hits: [], total: 0, tookMs: 0 });
  }

  const start = performance.now();
  const canonical = canonicalName(q);
  const pattern = `%${canonical}%`;
  const namePattern = `%${q.toLowerCase()}%`;

  const hits = await db
    .select({
      id: entities.id,
      type: entities.type,
      name: entities.name,
      totalContractsReceivedUsd: entities.totalContractsReceivedUsd,
      totalDonationsMadeUsd: entities.totalDonationsMadeUsd,
      anomalyScore: entities.anomalyScore,
    })
    .from(entities)
    .where(or(like(entities.canonicalName, pattern), like(sql`lower(${entities.name})`, namePattern)))
    .orderBy(desc(entities.totalContractsReceivedUsd))
    .limit(limit);

  const tookMs = Math.round(performance.now() - start);

  return c.json({
    query: q,
    hits: hits.map((h) => ({
      entity: { id: h.id, type: h.type, name: h.name },
      score: 1, // TODO: relevance scoring
      matchedFields: ["name"],
    })),
    total: hits.length,
    tookMs,
  });
});
