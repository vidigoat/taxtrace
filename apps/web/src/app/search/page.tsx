import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SearchResults } from "@/components/SearchResults";
import { Search } from "@/components/Search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-8">
        <div className="mb-8">
          <Search />
        </div>
        <SearchResults query={q} />
      </main>
      <Footer />
    </div>
  );
}
