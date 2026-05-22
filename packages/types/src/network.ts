import { z } from "zod";
import { EntityTypeEnum } from "./entity";

/**
 * NetworkEdge — a relationship between two entities, weighted by money flow.
 * Pre-computed for fast graph traversal.
 */
export const EdgeKindEnum = z.enum([
  "contract", // agency → company
  "donation", // donor → recipient
  "lobbies", // company → committee
  "employs", // company → person
  "subsidiary", // parent → child company
  "officer", // person → company (board/officer role)
]);
export type EdgeKind = z.infer<typeof EdgeKindEnum>;

export const NetworkEdgeSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  kind: EdgeKindEnum,
  weightUsd: z.number().nonnegative().default(0),
  count: z.number().int().nonnegative().default(1),
  firstSeenAt: z.date(),
  lastSeenAt: z.date(),
});

export type NetworkEdge = z.infer<typeof NetworkEdgeSchema>;

/**
 * NetworkNode — for graph rendering (matches Cytoscape data format).
 */
export const NetworkNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: EntityTypeEnum,
  size: z.number().describe("Render size, proportional to $ involvement"),
  color: z.string().describe("Render color (e.g. for risk)"),
  anomalyScore: z.number().min(0).max(1).default(0),
});

export type NetworkNode = z.infer<typeof NetworkNodeSchema>;

/**
 * NetworkGraph — the response shape for /api/network/:id.
 */
export const NetworkGraphSchema = z.object({
  rootId: z.string(),
  nodes: z.array(NetworkNodeSchema),
  edges: z.array(NetworkEdgeSchema),
  depth: z.number().int().nonnegative(),
});

export type NetworkGraph = z.infer<typeof NetworkGraphSchema>;
