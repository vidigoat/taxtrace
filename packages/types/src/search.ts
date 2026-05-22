import { z } from "zod";
import { EntityRefSchema } from "./entity";

export const SearchHitSchema = z.object({
  entity: EntityRefSchema,
  snippet: z.string().optional(),
  score: z.number(),
  matchedFields: z.array(z.string()).default([]),
});

export type SearchHit = z.infer<typeof SearchHitSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  hits: z.array(SearchHitSchema),
  total: z.number().int().nonnegative(),
  tookMs: z.number().int().nonnegative(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;
