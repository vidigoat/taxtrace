export function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500">
        <span>
          TaxTrace v0.1 ·{" "}
          <a href="https://github.com/vidigoat/taxtrace" target="_blank" rel="noreferrer" className="text-neutral-700 hover:underline">
            open source
          </a>{" "}
          · MIT licensed
        </span>
        <span className="text-center sm:text-right">
          Data: USAspending.gov, FPDS, FEC, OpenSecrets, SEC EDGAR, DOGE.gov · Updated daily
        </span>
      </div>
    </footer>
  );
}
