import { Hono } from "hono";
import { entities, contracts, donations, eq, desc } from "@taxtrace/db";
import type { Env } from "../index";

export const entitiesRouter = new Hono<Env>();

/** GET /entities/:id — full entity profile with denormalized stats. */
entitiesRouter.get("/:id", async (c) => {
  const db = c.var.db;
  const id = c.req.param("id");

  const entity = await db.query.entities.findFirst({
    where: eq(entities.id, id),
  });

  if (!entity) {
    return c.json({ error: "Entity not found" }, 404);
  }

  // Top contracts received (as recipient)
  const topContracts = await db.query.contracts.findMany({
    where: eq(contracts.recipientId, id),
    orderBy: [desc(contracts.amountUsd)],
    limit: 20,
  });

  // Donations made (as donor)
  const donationsMade = await db.query.donations.findMany({
    where: eq(donations.donorId, id),
    orderBy: [desc(donations.amountUsd)],
    limit: 20,
  });

  // Donations received (as recipient — for committees/candidates)
  const donationsReceived = await db.query.donations.findMany({
    where: eq(donations.recipientId, id),
    orderBy: [desc(donations.amountUsd)],
    limit: 20,
  });

  return c.json({
    entity,
    topContracts,
    donationsMade,
    donationsReceived,
  });
});

/** GET /entities — list with pagination. */
entitiesRouter.get("/", async (c) => {
  const db = c.var.db;
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const type = c.req.query("type");

  const rows = await db.query.entities.findMany({
    where: type ? eq(entities.type, type as any) : undefined,
    orderBy: [desc(entities.totalContractsReceivedUsd)],
    limit,
    offset,
  });

  return c.json({ entities: rows, limit, offset });
});
