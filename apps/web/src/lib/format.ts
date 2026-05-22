export function formatMoney(usd: number | null | undefined, compact = true): string {
  if (usd == null || Number.isNaN(usd)) return "—";
  const abs = Math.abs(usd);
  const sign = usd < 0 ? "-" : "";

  if (compact) {
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  }
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

export function formatDate(d: string | number | Date | null | undefined): string {
  if (d == null || d === "") return "—";
  let date: Date;
  if (d instanceof Date) {
    date = d;
  } else if (typeof d === "number") {
    // SQLite + Drizzle `mode: 'timestamp'` returns Unix seconds.
    // JS Date constructor wants milliseconds. Anything <1e12 is seconds → ×1000.
    date = new Date(d < 1e12 ? d * 1000 : d);
  } else {
    date = new Date(d);
  }
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
