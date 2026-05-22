import { useQuery } from "@tanstack/react-query";
import { fetchEntity } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/format";
import { NetworkView } from "./NetworkView";
import { useState } from "react";

export function EntityProfile({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["entity", id],
    queryFn: () => fetchEntity(id),
  });
  const [showNetwork, setShowNetwork] = useState(false);

  if (isLoading) {
    return <div className="h-96 bg-neutral-100 rounded animate-pulse" />;
  }
  if (error || !data?.entity) {
    return <div className="text-red-600">Entity not found.</div>;
  }

  const e = data.entity;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">{e.type}</div>
        <h1 className="text-3xl font-bold">{e.name}</h1>
        {e.description && <p className="text-neutral-600 mt-2">{e.description}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Contracts received" value={formatMoney(e.totalContractsReceivedUsd)} />
        <Stat label="Donations made" value={formatMoney(e.totalDonationsMadeUsd)} />
        <Stat label="Donations received" value={formatMoney(e.totalDonationsReceivedUsd)} />
        <Stat label="Anomaly score" value={`${Math.round((e.anomalyScore ?? 0) * 100)}/100`} />
      </div>

      {/* Action */}
      <button
        onClick={() => setShowNetwork((s) => !s)}
        className="px-5 py-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 text-sm font-medium"
      >
        {showNetwork ? "Hide network" : "Show network →"}
      </button>

      {showNetwork && (
        <div>
          <h2 className="text-xl font-semibold mb-3">Connections</h2>
          <NetworkView rootId={id} />
        </div>
      )}

      {/* Top contracts */}
      {data.topContracts.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-3">Top contracts</h2>
          <div className="border border-neutral-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="text-left p-3">Award ID</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-right p-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.topContracts.slice(0, 20).map((c: any) => (
                  <tr key={c.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="p-3 font-mono text-xs">{c.awardIdPiid?.slice(0, 32)}…</td>
                    <td className="p-3 text-neutral-600 max-w-md truncate">
                      {c.description ?? "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium">
                      {formatMoney(c.amountUsd)}
                    </td>
                    <td className="p-3 text-right text-neutral-500">
                      {formatDate(c.signedDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 border border-neutral-200 rounded-lg">
      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
