/** Parse various date formats from federal data sources. */
export function parseDate(raw: string | Date | null | undefined): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return raw;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Days between two dates (b - a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Format a date for display: 2026-05-22 → "May 22, 2026". */
export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
