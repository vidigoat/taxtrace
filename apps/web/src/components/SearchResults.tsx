import { fetchSearch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

export function SearchResults({ query }: { query: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["search", query],
    queryFn: () => fetchSearch(query),
    enabled: query.length >= 2,
  });

  if (!query || query.length < 2) {
    return <p className="text-neutral-500">Type at least 2 characters to search.</p>;
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 bg-neutral-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600">
        Search failed. Check that the API is running at <code>localhost:8787</code>.
      </div>
    );
  }

  if (!data || data.hits.length === 0) {
    return (
      <div className="text-neutral-500">
        No matches for &ldquo;<b>{query}</b>&rdquo;.
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-neutral-500 mb-3">
        {data.total} results in {data.tookMs} ms
      </div>
      <ul className="space-y-2">
        {data.hits.map((hit) => (
          <li key={hit.entity.id}>
            <Link
              to={`/entity/${hit.entity.id}`}
              className="flex items-center justify-between p-4 border border-neutral-200 rounded-lg hover:border-neutral-900 hover:bg-neutral-50 transition-colors"
            >
              <div>
                <div className="font-medium">{hit.entity.name}</div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider mt-1">
                  {hit.entity.type}
                </div>
              </div>
              <span className="text-neutral-400">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
