# SkyShield AI

> **Open AI agent for satellite safety. Verified physics, plain English.**

An open-source AI agent that anyone with a satellite can ask "is it safe?" — backed by physics validated against the US Office of Space Commerce's official [TraCSS](https://space.commerce.gov/traffic-coordination-system-for-space-tracss/) conjunction-prediction benchmark.

Built solo in 8 weeks by [Vidit Patankar](https://github.com/vidigoat).

## Status: ✅ Backend v0.1 shipped (week 1)

| Layer | Status |
|---|---|
| OCM parser (TraCSS ephemerides) | ✅ Implemented + tested |
| TLE parser (Celestrak) | ✅ Implemented + tested |
| SGP4 in JAX | ✅ Implemented + tested |
| Pc methods (Alfano, Chan, Foster, Patera, Monte Carlo) | ✅ Implemented + tested |
| Spatial screening (octree, Z-order, SFSH) | ✅ Implemented + tested |
| Differentiable maneuver optimizer | ✅ Implemented + tested |
| TraCSS eval harness | ✅ Implemented (awaiting 20.73 GB dataset extraction) |
| AI agent (Anthropic Claude) | ✅ Implemented (awaiting API key) |
| FastAPI backend | ✅ Implemented |
| 3D globe + chat UI (frontend) | ⏳ Planned (separate session) |

**63/63 tests passing.** Ready for benchmark runs once the TraCSS dataset finishes downloading.

## Headline targets

| Benchmark | Target | Source |
|---|---|---|
| TraCSS Spherical answer key | Near-perfect agreement per Auman 2025 thresholds | Office of Space Commerce verification dataset |
| TraCSS SFSH answer key | Near-perfect agreement per Auman 2025 thresholds | Office of Space Commerce verification dataset |
| End-to-end wall clock (30K-object catalog) | <30 sec on single A100 | vs SpaceX Stargaze "minutes" |
| Screening throughput | >1000× speedup at N=30K | vs naive O(N²) |
| Pc agreement with NASA CARA | >99% within 1e-6 | NASA CARA gold-standard outputs |
| Agent query latency (p50) | <5 sec | — |

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Layer 8: skyshield.dev — public site                              │
│           Tab 1: Live Three.js Globe   |   Tab 2: AI Agent Chat   │
├────────────────────────────────────────────────────────────────────┤
│  Layer 7: Next.js frontend (separate repo / session)               │
├────────────────────────────────────────────────────────────────────┤
│  Layer 6: FastAPI backend (skyshield/server)                       │
├────────────────────────────────────────────────────────────────────┤
│  Layer 5: AI Agent (skyshield/agent) — Anthropic Claude            │
├────────────────────────────────────────────────────────────────────┤
│  Layer 4: Differentiable maneuver optimizer (skyshield/avoid)      │
├────────────────────────────────────────────────────────────────────┤
│  Layer 3: GPU-batched collision probability (skyshield/pc)         │
├────────────────────────────────────────────────────────────────────┤
│  Layer 2: Octree + Z-order spatial screening (skyshield/screen)    │
├────────────────────────────────────────────────────────────────────┤
│  Layer 1: SGP4 propagation in JAX (skyshield/propagate)            │
├────────────────────────────────────────────────────────────────────┤
│  Layer 0: Data — TraCSS + Celestrak + NASA CARA fixtures           │
└────────────────────────────────────────────────────────────────────┘
```

## Install

```bash
git clone https://github.com/vidigoat/skyshield-ai.git
cd skyshield-ai
uv sync --all-extras
```

## Quick start

```bash
# Run the test suite
uv run pytest

# Run a benchmark
uv run python -m benchmarks.bench_propagate

# Run the TraCSS evaluation (requires dataset)
uv run skyshield eval tracss --data-dir ./data/tracss

# Start the backend server
uv run uvicorn skyshield.server.app:app --reload

# Talk to the agent (requires ANTHROPIC_API_KEY in .env)
uv run skyshield agent "is Starlink-1234 at risk this week?"
```

## Datasets

| Source | Purpose | License | How to get |
|---|---|---|---|
| TraCSS Aerospace IVV | Correctness benchmark (answer key) | CC0-1.0 | [Office of Space Commerce form](https://space.commerce.gov/dataset-for-conjunction-assessment-verification/) |
| Celestrak TLE catalog | Live demo on real catalog | Free public | `bash data/download_celestrak.sh` |
| NASA CARA fixtures | Pc cross-validation | NASA OSS | `python data/download_cara_fixtures.py` |

## References

- **TraCSS verification dataset:** Auman et al. 2025, [Validation Methodology for TraCSS Conjunction Assessment](https://amostech.com/TechnicalPapers/2025/ConjunctionRPO/Auman.pdf)
- **Alfano 2004 Pc method:** Salvatore Alfano, *Relating Position Uncertainty to Maximum Conjunction Probability* (2004)
- **jaxsgp4:** [arXiv:2603.27830](https://arxiv.org/abs/2603.27830) — GPU-accelerated mega-constellation propagation
- **∂SGP4:** [arXiv:2402.04830](https://arxiv.org/abs/2402.04830) — Closing the gap between SGP4 and high-precision propagation
- **NASA CARA:** [github.com/nasa/CARA_Analysis_Tools](https://github.com/nasa/CARA_Analysis_Tools)

## License

MIT — see `LICENSE`.

## About

Built by Vidit Patankar (14, Gurgaon). Inspired by Elon Musk's May 21, 2026 SpaceXAI hiring tweet ("if you've made a very complex thing do useful work, that's a major plus").
