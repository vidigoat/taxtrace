"""Extract the Top 100 Highest-Pc Conjunctions from the TraCSS answer key.

The TraCSS Aerospace IVV verification dataset contains 913,330 conjunction
events labeled with Pc values via the Alfano 2004 method. **Nobody has
publicly extracted and published the riskiest ones.**

This script:
  1. Streams the 450 MB answer-key CSV (memory-efficient)
  2. Filters out NaN/null Pc values and dilution-flagged events
  3. Maintains a heap of the top-100 highest-Pc events
  4. Cross-references against the SFSH volume-mapping file for object metadata
  5. Writes:
     - data/top_100_riskiest.md  (human-readable markdown table)
     - data/top_100_riskiest.json (machine-readable for the agent)

Run: `uv run python scripts/top_100_riskiest.py`
"""

from __future__ import annotations

import csv
import gzip
import heapq
import json
from datetime import datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
SPHERICAL_CSV = REPO_ROOT / "data" / "tracss" / "IVV_Releasable_Dataset_Spherical_DefaultHBR.csv"
SPHERICAL_CSV_GZ = REPO_ROOT / "data" / "tracss" / "IVV_Releasable_Dataset_Spherical_DefaultHBR.csv.gz"
SIZE_CSV = REPO_ROOT / "data" / "tracss" / "AerospaceIVVDataset_20251009a_Size_ScreeningVolumes.csv"

OUTPUT_MD = REPO_ROOT / "data" / "top_100_riskiest.md"
OUTPUT_JSON = REPO_ROOT / "data" / "top_100_riskiest.json"

N_TOP = 100


def _open(path: Path):
    """Open path as text whether gzipped or not."""
    if path.exists():
        return path.open("r", encoding="utf-8")
    gz = path.with_suffix(path.suffix + ".gz")
    if gz.exists():
        return gzip.open(gz, "rt", encoding="utf-8")
    raise FileNotFoundError(f"Neither {path} nor {gz} exists")


def load_object_metadata() -> dict[int, dict[str, Any]]:
    """Parse the volume-mapping CSV for per-object HBR and orbit regime."""
    meta: dict[int, dict[str, Any]] = {}
    if not SIZE_CSV.exists():
        return meta
    with SIZE_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                cat = int(row["catalog_num"])
            except (KeyError, ValueError):
                continue
            meta[cat] = {
                "hbr_m": float(row.get("HBR") or 0.0),
                "volume": row.get("ScreeningVolume", "").strip(),
                "u_km": float(row.get("U (km)") or 0.0),
                "v_km": float(row.get("V (km)") or 0.0),
                "w_km": float(row.get("W (km)") or 0.0),
            }
    return meta


def classify_object(sat_id: int) -> str:
    """Classify a TraCSS Sat ID per User Guide §3.1 ranges."""
    if 5 <= sat_id <= 62461:
        return "real (Space-Track catalog, Jan 2025)"
    if 90006 <= sat_id <= 90190:
        return "synthetic maneuver / victim"
    if 95000 <= sat_id <= 95407:
        return "historical CDM (re-propagated)"
    if 99000 <= sat_id <= 99008:
        return "fictitious edge case"
    if 99996 <= sat_id <= 99999:
        return "Osiris-Rex sample-return capsule"
    return "unknown"


def main() -> None:
    print(f"Loading object metadata from {SIZE_CSV}...")
    meta = load_object_metadata()
    print(f"  loaded {len(meta)} object size entries")

    print(f"Streaming {SPHERICAL_CSV}...")
    # Min-heap of size N_TOP holding (pc, idx, row) — replace if a larger Pc is seen
    heap: list[tuple[float, int, dict[str, Any]]] = []
    n_scanned = 0
    n_kept = 0
    n_diluted = 0

    with _open(SPHERICAL_CSV) as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            n_scanned += 1
            pc_raw = row.get("prob")
            if not pc_raw or pc_raw == "NULL":
                continue
            try:
                pc = float(pc_raw)
            except ValueError:
                continue
            if pc <= 0:
                continue
            # Filter out diluted-covariance events — they're unreliable
            dil = row.get("dilution", "0").strip()
            if dil == "1":
                n_diluted += 1
                continue

            n_kept += 1
            if len(heap) < N_TOP:
                heapq.heappush(heap, (pc, idx, row))
            elif pc > heap[0][0]:
                heapq.heappushpop(heap, (pc, idx, row))

            if n_scanned % 100_000 == 0:
                print(f"  scanned {n_scanned:>7d} rows, kept {n_kept}, lowest top Pc = {heap[0][0]:.3e}")

    print(f"  total: {n_scanned:,} rows scanned, {n_kept:,} kept (non-null + robust), {n_diluted:,} diluted-skipped")

    # Sort descending by Pc
    top = sorted(heap, key=lambda x: -x[0])

    # Build records
    records: list[dict[str, Any]] = []
    for rank, (pc, _idx, row) in enumerate(top, start=1):
        obj1 = int(row["obj1"])
        obj2 = int(row["obj2"])
        records.append({
            "rank": rank,
            "pc": pc,
            "pc_1_in_n": int(round(1.0 / pc)) if pc > 0 else None,
            "obj1": obj1,
            "obj2": obj2,
            "obj1_class": classify_object(obj1),
            "obj2_class": classify_object(obj2),
            "obj1_hbr_m": meta.get(obj1, {}).get("hbr_m"),
            "obj2_hbr_m": meta.get(obj2, {}).get("hbr_m"),
            "min_range_km": float(row["min_range"]) if row.get("min_range") else None,
            "vrel_kms": float(row["Vrel"]) if row.get("Vrel") else None,
            "mahalanobis": float(row["mdistance"]) if row.get("mdistance") else None,
            "tca": row.get("epoch", ""),
        })

    # Markdown
    md_lines = []
    md_lines.append("# Top 100 Highest-Pc Conjunctions — Aerospace IVV Verification Dataset")
    md_lines.append("")
    md_lines.append(f"Generated: {datetime.utcnow().isoformat(timespec='seconds')}Z")
    md_lines.append("")
    md_lines.append(
        "From the **US Office of Space Commerce TraCSS verification answer key** "
        f"({n_scanned:,} conjunctions, October 2025 snapshot, CC0-1.0 public domain)."
    )
    md_lines.append("")
    md_lines.append(
        f"Filter applied: dropped {n_diluted:,} events flagged with dilution=1 "
        "(diluted-covariance = unreliable Pc per Aerospace IVV User Guide §5)."
    )
    md_lines.append("")
    md_lines.append("All Pc values were computed by Aerospace Corporation's CSieve tool "
                    "using the Alfano 2004 method on the published ephemerides.")
    md_lines.append("")
    md_lines.append("## Ranking")
    md_lines.append("")
    md_lines.append("| # | obj1 → obj2 | Pc | ≈ 1-in-N | Miss (km) | Vrel (km/s) | TCA | Classification |")
    md_lines.append("|---|---|---|---|---|---|---|---|")
    for r in records[:100]:
        cls = r["obj1_class"]
        if r["obj1_class"] != r["obj2_class"]:
            cls = f"{r['obj1_class']} / {r['obj2_class']}"
        n_in = r["pc_1_in_n"]
        n_in_str = f"1 in {n_in:,}" if n_in and n_in > 0 else "—"
        md_lines.append(
            f"| {r['rank']} | {r['obj1']} → {r['obj2']} | {r['pc']:.3e} | {n_in_str} | "
            f"{r['min_range_km']:.3f} | {r['vrel_kms']:.2f} | {r['tca']} | {cls} |"
        )

    md_lines.append("")
    md_lines.append("## What this means")
    md_lines.append("")
    md_lines.append("This is the first public ranking of the highest-Pc conjunction events in "
                    "the Aerospace IVV verification dataset. The dataset was released in October 2025 "
                    "as a diagnostic benchmark for SSA service providers — but until now, nobody had "
                    "publicly extracted and named the highest-risk events.")
    md_lines.append("")
    md_lines.append("Caveats (these are real):")
    md_lines.append("- The TraCSS verification dataset is **explicitly diagnostic**, not operational "
                    "(per User Guide §2). These Pc values came from the dataset's curated input "
                    "ephemerides, not from real-time orbit determination of actual satellites today.")
    md_lines.append("- High-Pc rows in the historical CDM and fictitious-edge-case ranges are by "
                    "design — they were *engineered* to stress conjunction-assessment algorithms.")
    md_lines.append("- Real Space-Track-catalog objects (Sat ID 5–62461) are flagged in the "
                    "Classification column; their Pc reflects January 2025 orbital states.")
    md_lines.append("")
    md_lines.append("**Source:** SkyShield AI · [github.com/vidigoat/skyshield-ai]"
                    "(https://github.com/vidigoat/skyshield-ai)")

    OUTPUT_MD.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_MD} ({len(md_lines)} lines)")

    OUTPUT_JSON.write_text(json.dumps({
        "generated": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "source_dataset": "Aerospace IVV Verification, Office of Space Commerce, Oct 2025 (CC0-1.0)",
        "total_conjunctions_scanned": n_scanned,
        "robust_conjunctions": n_kept,
        "diluted_filtered": n_diluted,
        "top_100": records,
    }, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
