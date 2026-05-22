import { Hono } from "hono";
import { entities, edges, eq, or, inArray, desc } from "@taxtrace/db";
import type { Env } from "../index";

export const networkRouter = new Hono<Env>();

/**
 * GET /network/:id?depth=N
 *
 * Returns the N-degree ego network around an entity.
 * Default depth=2 (enough for "donor → committee → politician").
 *
 * Uses iterative BFS over the `edges` table. Fast enough for depth=2-3 on
 * SQLite; production would switch to PostgreSQL recursive CTEs or AGE.
 */
networkRouter.get("/:id", async (c) => {
  const db = c.var.db;
  const rootId = c.req.param("id");
  const depth = Math.min(Number(c.req.query("depth") ?? 2), 4);
  const maxNodes = Math.min(Number(c.req.query("maxNodes") ?? 200), 500);

  const visited = new Set<string>([rootId]);
  const allEdges: Array<{ from: string; to: string; kind: string; weight: number }> = [];
  let frontier: Set<string> = new Set([rootId]);

  for (let d = 0; d < depth && visited.size < maxNodes; d++) {
    const ids = Array.from(frontier);
    if (ids.length === 0) break;

    const layer = await db
      .select()
      .from(edges)
      .where(or(inArray(edges.fromId, ids), inArray(edges.toId, ids)))
      .orderBy(desc(edges.weightUsd))
      .limit(maxNodes);

    const next = new Set<string>();
    for (const e of layer) {
      allEdges.push({ from: e.fromId, to: e.toId, kind: e.kind, weight: e.weightUsd });
      for (const id of [e.fromId, e.toId]) {
        if (!visited.has(id)) {
          visited.add(id);
          next.add(id);
          if (visited.size >= maxNodes) break;
        }
      }
    }
    frontier = next;
  }

  // Fetch entity details for all visited nodes
  const nodes = await db
    .select({
      id: entities.id,
      type: entities.type,
      name: entities.name,
      anomalyScore: entities.anomalyScore,
      totalContractsReceivedUsd: entities.totalContractsReceivedUsd,
    })
    .from(entities)
    .where(inArray(entities.id, Array.from(visited)));

  return c.json({
    rootId,
    depth,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.name,
      type: n.type,
      size: Math.log10((n.totalContractsReceivedUsd ?? 0) + 10) * 4,
      color: colorForType(n.type, n.anomalyScore),
      anomalyScore: n.anomalyScore,
    })),
    edges: allEdges,
  });
});

function colorForType(type: string, anomaly: number): string {
  if (anomaly >= 0.7) return "#ef4444"; // red
  if (anomaly >= 0.4) return "#f59e0b"; // amber
  return (
    {
      company: "#3b82f6", // blue
      person: "#a855f7", // purple
      agency: "#10b981", // green
      pac: "#f97316", // orange
      committee: "#06b6d4", // cyan
      subagency: "#6366f1", // indigo
    }[type] ?? "#9ca3af"
  );
}
