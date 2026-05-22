import { ulid } from "ulid";

/** Generate a sortable, URL-safe ID for any entity. */
export function newId(prefix?: string): string {
  const id = ulid();
  return prefix ? `${prefix}_${id}` : id;
}
