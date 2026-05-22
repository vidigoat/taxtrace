import { Search } from "@/components/Search";
import { StatsBlock } from "@/components/StatsBlock";
import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <main className="flex-1">
      <section className="max-w-4xl mx-auto px-4 sm:px-8 pt-20 pb-12 text-center">
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">
          Every federal dollar.
        </h1>
        <p className="text-xl sm:text-2xl text-neutral-600 mb-10">
          Every contract. Every connection. Public.
        </p>

        <Search />

        <div className="mt-6 text-sm text-neutral-500 flex flex-wrap justify-center gap-x-6 gap-y-2">
          <SuggestedQuery q="Lockheed Martin" />
          <SuggestedQuery q="Department of Defense" />
          <SuggestedQuery q="NASA" />
          <SuggestedQuery q="Booz Allen Hamilton" />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-8 pb-20">
        <StatsBlock />
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-8 pb-20">
        <h2 className="text-2xl font-semibold mb-6">What TaxTrace does</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          <FeatureCard
            title="Search everything"
            desc="Every federal contractor, every politician, every PAC, every donation. Type a name, get the full profile in 100ms."
          />
          <FeatureCard
            title="Auto-detect anomalies"
            desc="Sole-source contracts. Repeat awardees. Price spikes. Donations followed by contracts. The patterns journalists look for, found automatically."
          />
          <FeatureCard
            title="Visualize the network"
            desc="3D graph of who pays whom. Find connections between any two entities in milliseconds. WebGL renders 10K+ nodes smoothly."
          />
          <FeatureCard
            title="Open + free"
            desc="MIT-licensed. Public API. Data refreshed daily from USAspending, FPDS, SAM.gov, FEC, OpenSecrets, SEC EDGAR, DOGE.gov."
          />
        </div>
      </section>
    </main>
  );
}

function SuggestedQuery({ q }: { q: string }) {
  return (
    <Link
      to={`/search?q=${encodeURIComponent(q)}`}
      className="text-neutral-500 hover:text-neutral-900 underline-offset-2 hover:underline"
    >
      {q}
    </Link>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border border-neutral-200 rounded-xl p-5">
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-neutral-600 leading-relaxed">{desc}</p>
    </div>
  );
}
