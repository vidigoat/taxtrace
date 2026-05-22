import { z } from "zod";
import { EntityRefSchema } from "./entity";

/**
 * Federal contract — a single award from a federal agency to a recipient.
 * Schema mirrors USAspending.gov + FPDS award fields we care about.
 */
export const ContractSchema = z.object({
  id: z.string(),

  // Foreign keys
  recipientId: z.string().describe("Entity.id of contractor"),
  agencyId: z.string().describe("Entity.id of awarding agency"),

  // Award details
  awardIdPiid: z.string().describe("USAspending PIID (Procurement Instrument ID)"),
  parentAwardId: z.string().optional(),
  awardType: z.string().describe("e.g. 'BPA Call', 'Definitive Contract', 'IDV'"),
  contractType: z.string().optional().describe("Pricing arrangement"),

  // Money
  amountUsd: z.number().describe("Federal action obligation (USD)"),
  baseAndAllOptionsUsd: z.number().optional(),
  obligationsToDate: z.number().optional(),

  // Dates
  signedDate: z.date(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),

  // Description
  description: z.string().optional(),
  naicsCode: z.string().optional().describe("Industry classification"),
  pscCode: z.string().optional().describe("Product/Service Code"),

  // Competition flags (the juicy ones)
  competitionExtent: z.string().optional().describe("e.g. 'Full and Open', 'Sole Source'"),
  numberOfOffersReceived: z.number().int().nonnegative().optional(),
  isSetAside: z.boolean().default(false),
  setAsideType: z.string().optional(),

  // Place of performance
  performanceState: z.string().optional(),
  performanceCity: z.string().optional(),
  performanceCountry: z.string().optional(),

  // Sourcing metadata
  source: z.string().describe("e.g. 'usaspending', 'fpds'"),
  sourceUpdatedAt: z.date(),
  ingestedAt: z.date(),
});

export type Contract = z.infer<typeof ContractSchema>;

/**
 * Contract with joined entity refs — used in API responses.
 */
export const ContractWithEntitiesSchema = ContractSchema.extend({
  recipient: EntityRefSchema,
  agency: EntityRefSchema,
});

export type ContractWithEntities = z.infer<typeof ContractWithEntitiesSchema>;
