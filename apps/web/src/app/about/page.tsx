import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-8 py-12">
        <h1 className="text-3xl font-bold mb-6">About TaxTrace</h1>

        <div className="prose prose-neutral max-w-none space-y-4">
          <p>
            TaxTrace is an open-source platform for searching, visualizing, and auditing
            US federal spending. It combines data from{" "}
            <a href="https://www.usaspending.gov/" target="_blank" rel="noreferrer" className="underline">
              USAspending.gov
            </a>
            , FPDS, SAM.gov, the FEC, OpenSecrets, SEC EDGAR, DOGE.gov, and Wikidata
            into one searchable graph — then automatically detects suspicious patterns.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">What we detect</h2>
          <ul className="list-disc list-outside pl-6 space-y-2">
            <li>
              <b>Sole-source contracts</b> above the federal $250K competitive-bidding threshold
            </li>
            <li>
              <b>Repeat awardees</b> winning many consecutive contracts from the same agency
            </li>
            <li>
              <b>Price spikes</b> — awards more than 10× the median for their NAICS category
            </li>
            <li>
              <b>Timing correlations</b> — donations followed by contracts within 90 days
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">What we are not</h2>
          <p>
            TaxTrace shows patterns, not verdicts. A flagged contract is a lead for
            investigation, not proof of wrongdoing. Federal procurement law allows
            sole-source awards with proper justification. Donors regularly do legitimate
            business with the government.
          </p>
          <p>
            Use TaxTrace to surface things worth looking at — then read the underlying
            FOIA-able records to find out what actually happened.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">Methodology</h2>
          <p>
            Each detector is documented in code (
            <a href="https://github.com/vidigoat/taxtrace/tree/main/packages/anomaly" target="_blank" rel="noreferrer" className="underline">
              packages/anomaly
            </a>
            ). All thresholds are configurable. All findings include the evidence
            (specific contract IDs, donation IDs, dates, amounts) so anyone can verify.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">License + credits</h2>
          <p>
            MIT-licensed. Built by Vidit Patankar (14, Gurgaon, India). Stands on top
            of work by USAspending.gov, FEC, OpenSecrets, MuckRock, LittleSis, and
            many others. Inspired by{" "}
            <a href="https://x.com/elonmusk/status/..." target="_blank" rel="noreferrer" className="underline">
              Elon Musk&apos;s May 21, 2026 SpaceXAI hiring tweet
            </a>
            .
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
