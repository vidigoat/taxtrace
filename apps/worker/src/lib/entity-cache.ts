/**
 * In-memory entity cache used during ingestion.
 *
 * Many federal records reference the same entity (e.g., Lockheed appears in
 * 1000s of contracts). We cache lookups by canonical name to avoid hitting
 * the DB for each one.
 */

import { entities, eq, type DB } from "@taxtrace/db";
import { canonicalName, newId } from "@taxtrace/utils";
import type { NewEntity } from "@taxtrace/db";

export class EntityCache {
  private cache = new Map<string, string>(); // canonical → id

  constructor(private readonly db: DB) {}

  /** Get or create an entity by name. Returns its ID. */
  async getOrCreate(
    name: string,
    opts: {
      type: NewEntity["type"];
      ueiId?: string | null;
      fecId?: string | null;
      source: string;
      countryCode?: string;
      state?: string;
    },
  ): Promise<string> {
    const cleaned = name?.trim();
    if (!cleaned) {
      // Create an "unknown" placeholder
      cleaned;
    }
    const finalName = cleaned || `(Unknown ${opts.type})`;
    const canonical = canonicalName(finalName) || finalName.toLowerCase();

    const cacheKey = `${opts.type}::${canonical}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Check DB
    const existing = await this.db.query.entities.findFirst({
      where: eq(entities.canonicalName, canonical),
    });
    if (existing) {
      this.cache.set(cacheKey, existing.id);
      return existing.id;
    }

    // Create new
    const id = newId("ent");
    const now = new Date();
    const sources = JSON.stringify([opts.source]);

    await this.db.insert(entities).values({
      id,
      type: opts.type,
      name: finalName,
      canonicalName: canonical,
      ueiId: opts.ueiId ?? null,
      fecId: opts.fecId ?? null,
      countryCode: opts.countryCode ?? null,
      state: opts.state ?? null,
      sources,
      firstSeenAt: now,
      updatedAt: now,
    });

    this.cache.set(cacheKey, id);
    return id;
  }
}
