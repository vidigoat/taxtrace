import { fetchStats } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";

export function StatsBlock() {
  const { data, isLoading } = useQuery({ queryKey: ["stats"], queryFn: fetchStats });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-neutral-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Stat
        label="Contracts"
        value={formatNumber(data?.contracts.count ?? 0)}
        sub={`${formatMoney(data?.contracts.totalUsd ?? 0)} total`}
      />
      <Stat
        label="Entities"
        value={formatNumber(data?.entities.count ?? 0)}
        sub="contractors + agencies"
      />
      <Stat
        label="Donations"
        value={formatNumber(data?.donations.count ?? 0)}
        sub={`${formatMoney(data?.donations.totalUsd ?? 0)} total`}
      />
      <Stat
        label="Anomalies"
        value={formatNumber(data?.anomalies.count ?? 0)}
        sub={`${formatMoney(data?.anomalies.flaggedUsd ?? 0)} flagged`}
        highlight
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div
      className={`p-5 rounded-xl border ${highlight ? "border-red-300 bg-red-50/50" : "border-neutral-200"}`}
    >
      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-neutral-500 mt-1">{sub}</div>
    </div>
  );
}
