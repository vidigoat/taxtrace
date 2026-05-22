/**
 * OpenFEC API client.
 *
 * Docs: https://api.open.fec.gov/developers/
 * API key required (free, get from api.data.gov). Falls back to DEMO_KEY
 * with low rate limit if FEC_API_KEY env not set.
 */

import { z } from "zod";
import { RateLimiter, withRetry } from "./shared/rate-limit";

const BASE = "https://api.open.fec.gov/v1";

const PaginationSchema = z
  .object({
    page: z.number().optional(),
    pages: z.number().optional(),
    per_page: z.number().optional(),
    count: z.number().optional(),
  })
  .partial();

const ScheduleASchema = z.object({
  contributor_name: z.string().nullable(),
  contributor_employer: z.string().nullable().optional(),
  contributor_occupation: z.string().nullable().optional(),
  contributor_city: z.string().nullable().optional(),
  contributor_state: z.string().nullable().optional(),
  committee: z
    .object({
      name: z.string().nullable(),
      committee_id: z.string().nullable(),
    })
    .partial()
    .nullable()
    .optional(),
  contribution_receipt_date: z.string().nullable().optional(),
  contribution_receipt_amount: z.number().nullable().optional(),
  receipt_type: z.string().nullable().optional(),
  sub_id: z.string().optional(),
});

export type FecContribution = z.infer<typeof ScheduleASchema>;

const ScheduleAResponseSchema = z.object({
  results: z.array(ScheduleASchema),
  pagination: PaginationSchema.optional(),
});

export interface FecClientOptions {
  apiKey?: string;
  rps?: number;
  fetch?: typeof globalThis.fetch;
}

export class FecClient {
  private readonly apiKey: string;
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(opts: FecClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.FEC_API_KEY ?? "DEMO_KEY";
    this.limiter = new RateLimiter(opts.rps ?? 2, opts.rps ?? 2);
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  /** Search individual contributions (Schedule A) above a minimum amount. */
  async searchContributions(opts: {
    twoYearTransactionPeriod?: number;
    minAmount?: number;
    contributorName?: string;
    page?: number;
    perPage?: number;
  }): Promise<z.infer<typeof ScheduleAResponseSchema>> {
    await this.limiter.acquire();

    const params = new URLSearchParams({
      api_key: this.apiKey,
      per_page: String(opts.perPage ?? 100),
      page: String(opts.page ?? 1),
      sort_hide_null: "false",
      sort_null_only: "false",
      sort: "-contribution_receipt_date",
    });
    if (opts.twoYearTransactionPeriod) {
      params.set("two_year_transaction_period", String(opts.twoYearTransactionPeriod));
    }
    if (opts.minAmount != null) {
      params.set("min_amount", String(opts.minAmount));
    }
    if (opts.contributorName) {
      params.set("contributor_name", opts.contributorName);
    }

    return withRetry(async () => {
      const url = `${BASE}/schedules/schedule_a/?${params}`;
      const res = await this.fetchFn(url);
      if (!res.ok) {
        throw new Error(`FEC search failed: ${res.status} ${await res.text()}`);
      }
      const json = await res.json();
      return ScheduleAResponseSchema.parse(json);
    });
  }
}
