/**
 * Type-safe client for the TaxTrace API.
 *
 * Reads VITE_API_URL or NEXT_PUBLIC_API_URL. Falls back to localhost:8787.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export interface SearchHit {
  entity: { id: string; type: string; name: string };
  score: number;
  matchedFields: string[];
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
  total: number;
  tookMs: number;
}

export interface Stats {
  contracts: { count: number; totalUsd: number };
  donations: { count: number; totalUsd: number };
  entities: { count: number };
  anomalies: { count: number; flaggedUsd: number };
  topRecipients: Array<{ id: string; name: string; totalUsd: number }>;
  recentAnomalies: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    detectedAt: string;
    amountUsd: number | null;
  }>;
}

export async function fetchSearch(q: string): Promise<SearchResponse> {
  const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_URL}/stats`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error("Stats failed");
  return res.json();
}

export async function fetchEntity(id: string) {
  const res = await fetch(`${API_URL}/entities/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Entity fetch failed");
  return res.json();
}

export async function fetchAnomalies(opts: { limit?: number; severity?: string } = {}) {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.severity) params.set("severity", opts.severity);
  const res = await fetch(`${API_URL}/anomalies?${params}`);
  if (!res.ok) throw new Error("Anomalies fetch failed");
  return res.json();
}

export async function fetchNetwork(id: string, depth = 2) {
  const res = await fetch(`${API_URL}/network/${encodeURIComponent(id)}?depth=${depth}`);
  if (!res.ok) throw new Error("Network fetch failed");
  return res.json();
}
