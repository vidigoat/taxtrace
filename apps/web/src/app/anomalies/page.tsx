import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AnomaliesFeed } from "@/components/AnomaliesFeed";

export default function AnomaliesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-8">
        <h1 className="text-3xl font-bold mb-2">Anomaly feed</h1>
        <p className="text-neutral-600 mb-8">
          Patterns we&apos;ve auto-detected in federal spending. Each finding links to evidence.
          These are leads for investigation, not verdicts.
        </p>
        <AnomaliesFeed />
      </main>
      <Footer />
    </div>
  );
}
