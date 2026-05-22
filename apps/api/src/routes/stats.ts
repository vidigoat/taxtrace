import { anomalies, contracts, desc, donations, entities, sql } from "@taxtrace/db";
import { Hono } from "hono";
import type { Env } from "../index";

export const statsRouter = new Hono<Env>();

/** GET /stats — homepage dashboard numbers. */
statsRouter.get("/", async (c) => {
  const db = c.var.db;

  const [contractsAgg] = await db
    .select({
      total: sql<number>`count(*)`,
      sumUsd: sql<number>`sum(${contracts.amountUsd})`,
    })
    .from(contracts);

  const [donationsAgg] = await db
    .select({
      total: sql<number>`count(*)`,
      sumUsd: sql<number>`sum(${donations.amountUsd})`,
    })
    .from(donations);

  const [entitiesAgg] = await db.select({ total: sql<number>`count(*)` }).from(entities);

  const [anomaliesAgg] = await db
    .select({
      total: sql<number>`count(*)`,
      sumUsd: sql<number>`sum(${anomalies.amountUsd})`,
    })
    .from(anomalies);

  const topRecipients = await db
    .select({
      id: entities.id,
      name: entities.name,
      totalUsd: entities.totalContractsReceivedUsd,
    })
    .from(entities)
    .orderBy(desc(entities.totalContractsReceivedUsd))
    .limit(10);

  const recentAnomalies = await db
    .select()
    .from(anomalies)
    .orderBy(desc(anomalies.detectedAt))
    .limit(5);

  return c.json({
    contracts: {
      count: contractsAgg?.total ?? 0,
      totalUsd: contractsAgg?.sumUsd ?? 0,
    },
    donations: {
      count: donationsAgg?.total ?? 0,
      totalUsd: donationsAgg?.sumUsd ?? 0,
    },
    entities: { count: entitiesAgg?.total ?? 0 },
    anomalies: {
      count: anomaliesAgg?.total ?? 0,
      flaggedUsd: anomaliesAgg?.sumUsd ?? 0,
    },
    topRecipients,
    recentAnomalies,
  });
});
