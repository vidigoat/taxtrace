import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchAnomalies } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/format";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-neutral-100 text-neutral-700 border-neutral-300",
};

const TYPE_LABELS: Record<string, string> = {
  sole_source: "Sole-source",
  shell_llc: "Shell LLC",
  price_spike: "Price spike",
  timing_correlation: "Timing correlation",
  network_cluster: "Network cluster",
  repeat_awardee: "Repeat awardee",
  split_award: "Split award",
  post_employment: "Revolving door",
};

export function AnomaliesFeed() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["anomalies"],
    queryFn: () => fetchAnomalies({ limit: 50 }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-neutral-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-red-600">Failed to load anomalies. Is the API running?</div>;
  }

  if (!data || data.anomalies.length === 0) {
    return (
      <div className="text-neutral-500 p-8 border border-dashed border-neutral-300 rounded-lg text-center">
        No anomalies detected yet. Run the detector with{" "}
        <code className="bg-neutral-100 px-2 py-0.5 rounded">bun run detect-anomalies</code>.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.anomalies.map((row: any) => {
        const a = row.anomaly;
        return (
          <article key={a.id} className="border border-neutral-200 rounded-lg p-5 hover:border-neutral-400 transition-colors">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded border ${SEVERITY_STYLES[a.severity] ?? ""}`}>
                  {a.severity.toUpperCase()}
                </span>
                <span className="text-xs text-neutral-500 uppercase tracking-wider">
                  {TYPE_LABELS[a.type] ?? a.type}
                </span>
                {a.amountUsd != null && (
                  <span className="text-xs font-bold tabular-nums">{formatMoney(a.amountUsd)}</span>
                )}
              </div>
              <span className="text-xs text-neutral-400">{formatDate(a.detectedAt)}</span>
            </div>
            <h3 className="font-semibold mb-1">
              {row.primaryEntity ? (
                <Link to={`/entity/${row.primaryEntity.id}`} className="hover:underline">
                  {a.title}
                </Link>
              ) : (
                a.title
              )}
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">
              {a.explanation}
            </p>
          </article>
        );
      })}
    </div>
  );
}
