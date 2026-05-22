import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-neutral-900 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 6h18M3 12h18M3 18h12" strokeLinecap="round" />
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight">TaxTrace</span>
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          <Link href="/search" className="hover:underline">Search</Link>
          <Link href="/anomalies" className="hover:underline">Anomalies</Link>
          <Link href="/about" className="hover:underline hidden sm:inline">About</Link>
          <a
            href="https://github.com/vidigoat/taxtrace"
            target="_blank"
            rel="noreferrer"
            className="text-neutral-500 hover:text-neutral-900"
          >
            GitHub ↗
          </a>
        </nav>
      </div>
    </header>
  );
}
