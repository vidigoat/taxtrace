import { anomalies, desc, entities, eq } from "@taxtrace/db";
import { Hono } from "hono";
import type { Env } from "../index";

export const anomaliesRouter = new Hono<Env>();

/** GET /anomalies — newest detected anomalies, paginated. */
anomaliesRouter.get("/", async (c) => {
  const db = c.var.db;
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const type = c.req.query("type");
  const severity = c.req.query("severity");

  const baseQuery = db
    .select({
      anomaly: anomalies,
      primaryEntity: { id: entities.id, name: entities.name, type: entities.type },
    })
    .from(anomalies)
    .leftJoin(entities, eq(anomalies.primaryEntityId, entities.id))
    .orderBy(desc(anomalies.detectedAt))
    .limit(limit)
    .offset(offset);

  let rows;
  if (type && severity) {
    rows = await baseQuery.where(eq(anomalies.type, type as any));
  } else if (type) {
    rows = await baseQuery.where(eq(anomalies.type, type as any));
  } else if (severity) {
    rows = await baseQuery.where(eq(anomalies.severity, severity as any));
  } else {
    rows = await baseQuery;
  }

  return c.json({ anomalies: rows, limit, offset });
});

/** GET /anomalies/:id — single anomaly. */
anomaliesRouter.get("/:id", async (c) => {
  const db = c.var.db;
  const id = c.req.param("id");
  const row = await db.query.anomalies.findFirst({ where: eq(anomalies.id, id) });
  if (!row) return c.json({ error: "Anomaly not found" }, 404);
  return c.json(row);
});
