import { useSearchParams } from "react-router-dom";
import { Search } from "@/components/Search";
import { SearchResults } from "@/components/SearchResults";

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-8">
      <div className="mb-8">
        <Search />
      </div>
      <SearchResults query={q} />
    </main>
  );
}
