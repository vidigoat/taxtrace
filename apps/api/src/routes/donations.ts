import { Hono } from "hono";
import { donations, entities, eq, desc } from "@taxtrace/db";
import type { Env } from "../index";

export const donationsRouter = new Hono<Env>();

donationsRouter.get("/", async (c) => {
  const db = c.var.db;
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const cycle = c.req.query("cycle");

  const baseQuery = db
    .select({
      donation: donations,
      donor: { id: entities.id, name: entities.name, type: entities.type },
    })
    .from(donations)
    .leftJoin(entities, eq(donations.donorId, entities.id))
    .orderBy(desc(donations.contributionDate))
    .limit(limit)
    .offset(offset);

  const rows = cycle ? await baseQuery.where(eq(donations.cycle, Number(cycle))) : await baseQuery;
  return c.json({ donations: rows, limit, offset });
});
