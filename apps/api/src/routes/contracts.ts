import { Hono } from "hono";
import { contracts, entities, eq, desc, sql } from "@taxtrace/db";
import type { Env } from "../index";

export const contractsRouter = new Hono<Env>();

/** GET /contracts — list with filters. */
contractsRouter.get("/", async (c) => {
  const db = c.var.db;
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const competition = c.req.query("competition"); // e.g. "Sole Source"

  const baseQuery = db
    .select({
      contract: contracts,
      recipient: { id: entities.id, name: entities.name, type: entities.type },
    })
    .from(contracts)
    .leftJoin(entities, eq(contracts.recipientId, entities.id))
    .orderBy(desc(contracts.amountUsd))
    .limit(limit)
    .offset(offset);

  const rows = competition
    ? await baseQuery.where(sql`${contracts.competitionExtent} LIKE ${`%${competition}%`}`)
    : await baseQuery;

  return c.json({ contracts: rows, limit, offset });
});

/** GET /contracts/:id — single contract. */
contractsRouter.get("/:id", async (c) => {
  const db = c.var.db;
  const id = c.req.param("id");
  const row = await db.query.contracts.findFirst({
    where: eq(contracts.id, id),
  });
  if (!row) return c.json({ error: "Contract not found" }, 404);
  return c.json(row);
});
