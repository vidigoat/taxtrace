import { z } from "zod";

/**
 * EntityType — every actor in the federal spending graph.
 * One unified type lets us put companies, people, agencies, and PACs
 * on the same network without separate tables for each.
 */
export const EntityTypeEnum = z.enum([
  "company", // A federal contractor (Lockheed, Raytheon, ...)
  "person", // An executive, lobbyist, or politician
  "agency", // A federal agency (DoD, NASA, HHS, ...)
  "pac", // A political action committee
  "committee", // A campaign committee
  "subagency", // A subordinate office (DARPA inside DoD)
]);
export type EntityType = z.infer<typeof EntityTypeEnum>;

export const EntitySchema = z.object({
  id: z.string(), // ULID
  type: EntityTypeEnum,
  name: z.string(),
  canonicalName: z.string().describe("Lowercase, normalized for matching"),

  // External IDs (any may be null; we match across sources)
  ueiId: z.string().optional().describe("SAM.gov Unique Entity Identifier"),
  duns: z.string().optional().describe("Legacy DUNS number"),
  ein: z.string().optional().describe("IRS EIN"),
  cik: z.string().optional().describe("SEC Central Index Key"),
  fecId: z.string().optional().describe("FEC committee or candidate ID"),
  bioguideId: z.string().optional().describe("Congress.gov politician ID"),
  wikidataQid: z.string().optional().describe("Wikidata Q-number"),

  // Metadata
  description: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  industry: z.string().optional(),
  foundedYear: z.number().int().optional(),

  // Derived metrics (denormalized for fast queries)
  totalContractsReceivedUsd: z.number().nonnegative().default(0),
  totalDonationsReceivedUsd: z.number().nonnegative().default(0),
  totalDonationsMadeUsd: z.number().nonnegative().default(0),
  anomalyScore: z.number().min(0).max(1).default(0),

  // Provenance
  sources: z.array(z.string()).describe("Data sources where seen"),
  firstSeenAt: z.date(),
  updatedAt: z.date(),
});

export type Entity = z.infer<typeof EntitySchema>;

/**
 * EntityRef — slim version used in nested contexts (graph edges, search results).
 */
export const EntityRefSchema = z.object({
  id: z.string(),
  type: EntityTypeEnum,
  name: z.string(),
});

export type EntityRef = z.infer<typeof EntityRefSchema>;
