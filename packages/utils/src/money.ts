/** Format a USD amount for display: $1,234,567.89 → "$1.23M" */
export function formatMoney(usd: number, opts: { compact?: boolean } = {}): string {
  if (usd == null || Number.isNaN(usd)) return "—";
  const abs = Math.abs(usd);

  if (opts.compact !== false) {
    if (abs >= 1e12) return `${sign(usd)}$${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign(usd)}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign(usd)}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign(usd)}$${(abs / 1e3).toFixed(1)}K`;
  }
  return `${sign(usd)}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function sign(n: number): string {
  return n < 0 ? "-" : "";
}

/** Parse a USD string like "$1,234,567.89" → 1234567.89 */
export function parseMoney(raw: string | number | null | undefined): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return raw;
  const cleaned = raw.replace(/[$,\s]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}
