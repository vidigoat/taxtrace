"""B8 — Agent query latency benchmark.

Target: p50 < 5 sec, p95 < 15 sec from user question to final answer.
Requires ANTHROPIC_API_KEY to run real measurements; otherwise reports stub-mode timing.
"""

from __future__ import annotations

import argparse
from time import perf_counter

from skyshield.agent.agent import SkyShieldAgent

DEMO_QUERIES = [
    "Is the ISS at risk of a close approach this week?",
    "What's the difference between Pc and miss distance?",
    "Compute Pc for a 100m head-on conjunction with 50m position sigma.",
    "Plan an avoidance burn 30 minutes before TCA, target 1km miss.",
    "How does the SFSH screening volume work for LEO?",
]


def run_benchmark(smoke: bool = False) -> dict:
    queries = DEMO_QUERIES[:2] if smoke else DEMO_QUERIES
    agent = SkyShieldAgent()
    timings = []
    for q in queries:
        t0 = perf_counter()
        resp = agent.ask(q)
        elapsed = perf_counter() - t0
        timings.append(elapsed)
        print(f"  Q: {q!r}")
        print(f"     elapsed: {elapsed:.2f}s, tool_calls: {len(resp.tool_events)}")
    timings.sort()
    return {
        "n_queries": len(timings),
        "min_seconds": timings[0],
        "median_seconds": timings[len(timings) // 2],
        "max_seconds": timings[-1],
        "has_api_access": agent.has_api_access,
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--smoke", action="store_true")
    args = p.parse_args()
    result = run_benchmark(args.smoke)
    print("B8 — Agent query latency")
    for k, v in result.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
