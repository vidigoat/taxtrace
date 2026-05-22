/**
 * USAspending.gov API client.
 *
 * Docs: https://api.usaspending.gov/
 * No auth, no key. Generous rate limits (~5 req/sec is polite).
 *
 * We use the `spending_by_award` search endpoint to pull contracts in pages,
 * then expand each award via `awards/{piid}` for full detail.
 */

import { z } from "zod";
import { RateLimiter, withRetry } from "./shared/rate-limit";

const BASE = "https://api.usaspending.gov";

// ── Response schemas (only the fields we care about) ─────────────────────────

const AwardSearchResultSchema = z
  .object({
    "Award ID": z.string().nullable().optional(),
    "Recipient Name": z.string().nullable().optional(),
    "Recipient UEI": z.string().nullable().optional(),
    "Award Amount": z.number().nullable().optional(),
    "Total Outlays": z.number().nullable().optional(),
    Description: z.string().nullable().optional(),
    "Awarding Agency": z.string().nullable().optional(),
    "Awarding Sub Agency": z.string().nullable().optional(),
    "Contract Award Type": z.string().nullable().optional(),
    "Start Date": z.string().nullable().optional(),
    "End Date": z.string().nullable().optional(),
    generated_internal_id: z.string().optional(),
    award_id: z.string().optional(),
  })
  .passthrough();

export type AwardSearchResult = z.infer<typeof AwardSearchResultSchema>;

const AwardSearchResponseSchema = z.object({
  limit: z.number(),
  results: z.array(AwardSearchResultSchema),
  page_metadata: z.object({
    page: z.number(),
    hasNext: z.boolean(),
    last_record_unique_id: z.union([z.number(), z.string()]).nullable().optional(),
  }),
});

// ── Client ───────────────────────────────────────────────────────────────────

export interface UsaSpendingClientOptions {
  /** Requests per second. Default 5. */
  rps?: number;
  /** Optional fetch override (for testing). */
  fetch?: typeof globalThis.fetch;
}

export class UsaSpendingClient {
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(opts: UsaSpendingClientOptions = {}) {
    this.limiter = new RateLimiter(opts.rps ?? 5, opts.rps ?? 5);
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  /**
   * Search contracts via the `spending_by_award` endpoint.
   *
   * @param opts.fiscalYears Years to include (default current fiscal year).
   * @param opts.minAmount Minimum award amount (default 0).
   * @param opts.limit Page size (max 100).
   * @param opts.page Page number (1-indexed).
   */
  async searchContracts(opts: {
    fiscalYears?: number[];
    minAmount?: number;
    limit?: number;
    page?: number;
    recipientUei?: string;
  }): Promise<z.infer<typeof AwardSearchResponseSchema>> {
    await this.limiter.acquire();

    const body = {
      filters: {
        award_type_codes: ["A", "B", "C", "D"], // contracts only
        time_period: (opts.fiscalYears ?? [new Date().getFullYear()]).map((y) => ({
          start_date: `${y - 1}-10-01`,
          end_date: `${y}-09-30`,
        })),
        ...(opts.minAmount != null && {
          award_amounts: [{ lower_bound: opts.minAmount }],
        }),
        ...(opts.recipientUei && { recipient_search_text: [opts.recipientUei] }),
      },
      fields: [
        "Award ID",
        "Recipient Name",
        "Recipient UEI",
        "Award Amount",
        "Total Outlays",
        "Description",
        "Awarding Agency",
        "Awarding Sub Agency",
        "Contract Award Type",
        "Start Date",
        "End Date",
      ],
      page: opts.page ?? 1,
      limit: opts.limit ?? 50,
      sort: "Award Amount",
      order: "desc",
    };

    return withRetry(async () => {
      const res = await this.fetchFn(`${BASE}/api/v2/search/spending_by_award/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`USAspending search failed: ${res.status} ${await res.text()}`);
      }
      const json = await res.json();
      return AwardSearchResponseSchema.parse(json);
    });
  }

  /** Get full detail for a single award by its generated_internal_id. */
  async getAward(awardId: string): Promise<unknown> {
    await this.limiter.acquire();
    return withRetry(async () => {
      const res = await this.fetchFn(`${BASE}/api/v2/awards/${encodeURIComponent(awardId)}/`);
      if (!res.ok) {
        throw new Error(`USAspending award detail failed: ${res.status}`);
      }
      return res.json();
    });
  }

  /** Pull the top-N highest-value contracts in a fiscal year (used for demo seeding). */
  async *streamTopContracts(opts: {
    fiscalYear: number;
    minAmount?: number;
    maxResults: number;
  }): AsyncGenerator<AwardSearchResult> {
    const pageSize = 100;
    let page = 1;
    let yielded = 0;

    while (yielded < opts.maxResults) {
      const response = await this.searchContracts({
        fiscalYears: [opts.fiscalYear],
        minAmount: opts.minAmount,
        limit: pageSize,
        page,
      });

      for (const result of response.results) {
        if (yielded >= opts.maxResults) return;
        yield result;
        yielded += 1;
      }

      if (!response.page_metadata.hasNext) return;
      page += 1;
    }
  }
}
