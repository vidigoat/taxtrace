import { z } from "zod";
import { EntityRefSchema } from "./entity";

/**
 * Campaign donation — an individual or PAC giving to a candidate or committee.
 * Mirrors FEC individual contribution + committee transaction data.
 */
export const DonationSchema = z.object({
  id: z.string(),

  // Foreign keys
  donorId: z.string().describe("Entity.id of giver (person or PAC)"),
  recipientId: z.string().describe("Entity.id of receiver (committee or candidate)"),

  // FEC metadata
  fecTransactionId: z.string().optional(),
  fecImageNumber: z.string().optional(),
  cycle: z.number().int().describe("Two-year election cycle (e.g., 2026)"),

  // Money + timing
  amountUsd: z.number(),
  contributionDate: z.date(),

  // Context
  transactionType: z.string().optional().describe("FEC code, e.g. '15', '24K'"),
  donorEmployer: z.string().optional(),
  donorOccupation: z.string().optional(),
  isEarmarked: z.boolean().default(false),
  memo: z.string().optional(),

  // Sourcing
  source: z.string().default("openfec"),
  ingestedAt: z.date(),
});

export type Donation = z.infer<typeof DonationSchema>;

/**
 * Donation with joined entity refs — used in API responses.
 */
export const DonationWithEntitiesSchema = DonationSchema.extend({
  donor: EntityRefSchema,
  recipient: EntityRefSchema,
});

export type DonationWithEntities = z.infer<typeof DonationWithEntitiesSchema>;
