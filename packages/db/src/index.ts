import { drizzle as drizzleBetter } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleBun } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export * from "./schema";
export {
  sql,
  eq,
  and,
  or,
  ne,
  gt,
  gte,
  lt,
  lte,
  like,
  inArray,
  isNotNull,
  isNull,
  desc,
  asc,
  count,
} from "drizzle-orm";

export type DB = ReturnType<typeof createDb>;

/**
 * Create a Drizzle DB instance. Uses bun:sqlite when running under Bun
 * (worker, API, scripts) and better-sqlite3 otherwise (Next.js node runtime
 * for server components — not used here but kept for compat).
 */
export function createDb(url?: string) {
  const dbPath = url ?? process.env.DATABASE_URL ?? "./data/taxtrace.db";

  // Detect Bun runtime
  if (typeof Bun !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
    const sqlite = new Database(dbPath, { create: true });
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec("PRAGMA synchronous = NORMAL");
    return drizzleBun(sqlite, { schema });
  }

  // Node fallback (won't run in our app but kept for tooling like drizzle-kit)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const sqlite = new (Database as any)(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  return drizzleBetter(sqlite, { schema });
}
