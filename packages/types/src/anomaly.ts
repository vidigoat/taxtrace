import { z } from "zod";
import { EntityRefSchema } from "./entity";

/**
 * Anomaly types — the patterns we automatically detect in federal spending.
 * Each is a documented heuristic, not a verdict. Users see the evidence
 * and decide.
 */
export const AnomalyTypeEnum = z.enum([
  "sole_source", // No-bid contract above threshold
  "shell_llc", // Contractor with no real-world footprint
  "price_spike", // Same service, 10× normal price
  "timing_correlation", // Donation → contract within N days
  "network_cluster", // Suspicious cluster of related entities
  "repeat_awardee", // Same contractor winning all bids in agency/category
  "split_award", // Award split to stay under threshold
  "post_employment", // Politician → lobbyist → contractor pipeline
]);
export type AnomalyType = z.infer<typeof AnomalyTypeEnum>;

export const AnomalySeverityEnum = z.enum(["low", "medium", "high", "critical"]);
export type AnomalySeverity = z.infer<typeof AnomalySeverityEnum>;

export const AnomalySchema = z.object({
  id: z.string(),
  type: AnomalyTypeEnum,
  severity: AnomalySeverityEnum,

  // What it's about
  primaryEntityId: z.string().describe("Main entity involved"),
  relatedEntityIds: z.array(z.string()).default([]),
  evidenceContractIds: z.array(z.string()).default([]),
  evidenceDonationIds: z.array(z.string()).default([]),

  // Score + explanation
  score: z.number().min(0).max(1).describe("Confidence 0-1"),
  title: z.string().describe("One-line headline"),
  explanation: z.string().describe("Detailed reasoning, with numbers"),

  // Money at stake
  amountUsd: z.number().optional().describe("Dollar value of the anomaly"),

  // Metadata
  detectedAt: z.date(),
  detectorVersion: z.string().describe("Algorithm version that found it"),
  reviewedAt: z.date().optional(),
  reviewerNote: z.string().optional(),
});

export type Anomaly = z.infer<typeof AnomalySchema>;

export const AnomalyWithEntitiesSchema = AnomalySchema.extend({
  primaryEntity: EntityRefSchema,
  relatedEntities: z.array(EntityRefSchema).default([]),
});

export type AnomalyWithEntities = z.infer<typeof AnomalyWithEntitiesSchema>;
