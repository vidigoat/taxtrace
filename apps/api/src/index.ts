import { createDb } from "@taxtrace/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { anomaliesRouter } from "./routes/anomalies";
import { contractsRouter } from "./routes/contracts";
import { donationsRouter } from "./routes/donations";
import { entitiesRouter } from "./routes/entities";
import { networkRouter } from "./routes/network";
import { searchRouter } from "./routes/search";
import { statsRouter } from "./routes/stats";

// Shared DB instance — created once per process.
const db = createDb();

export type Env = {
  Variables: {
    db: ReturnType<typeof createDb>;
  };
};

const app = new Hono<Env>();

app.use("*", logger());
app.use("*", cors({ origin: "*", maxAge: 600 }));

// Attach db to context
app.use("*", async (c, next) => {
  c.set("db", db);
  await next();
});

app.get("/", (c) => c.json({ name: "TaxTrace API", version: "0.1.0", status: "ok" }));
app.get("/health", (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.route("/entities", entitiesRouter);
app.route("/contracts", contractsRouter);
app.route("/donations", donationsRouter);
app.route("/search", searchRouter);
app.route("/network", networkRouter);
app.route("/anomalies", anomaliesRouter);
app.route("/stats", statsRouter);

const port = Number(process.env.PORT ?? 8787);

export default {
  port,
  fetch: app.fetch,
};

console.log(`🌐 TaxTrace API listening on http://localhost:${port}`);
