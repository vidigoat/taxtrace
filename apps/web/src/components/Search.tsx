"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
      className="relative max-w-2xl mx-auto"
    >
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search any contractor, politician, agency, donation…"
        className="w-full h-14 px-6 pr-32 text-lg border border-neutral-300 rounded-full focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
        autoFocus
      />
      <button
        type="submit"
        className="absolute right-2 top-2 h-10 px-5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-full text-sm font-medium"
      >
        Search
      </button>
    </form>
  );
}
