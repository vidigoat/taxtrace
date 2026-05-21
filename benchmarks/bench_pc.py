"""B3 — Pc method correctness benchmark.

Compares Alfano, Chan, Foster, Patera against Monte Carlo on a battery of
test conjunctions. Target: >99% agreement within 1e-6 absolute.
"""

from __future__ import annotations

import argparse

import numpy as np

from skyshield.pc.alfano import pc_alfano2004
from skyshield.pc.chan import pc_chan
from skyshield.pc.foster import pc_foster
from skyshield.pc.monte_carlo import pc_monte_carlo
from skyshield.pc.patera import pc_patera


def synth_conjunctions(n: int = 20, seed: int = 42) -> list[dict]:
    """Generate N synthetic conjunctions with varied geometries."""
    rng = np.random.default_rng(seed)
    fixtures: list[dict] = []
    for i in range(n):
        # Random orientations + miss distances 10m to 1km
        miss_km = rng.uniform(0.01, 1.0)
        # Random direction
        direction = rng.normal(size=3)
        direction = direction / np.linalg.norm(direction)
        r1 = np.array([7000.0, 0.0, 0.0])
        r2 = r1 + miss_km * direction
        # Counter-orbital relative velocity
        v1 = np.array([0.0, 7.5, 0.0])
        v2 = np.array([0.0, -7.5, 0.0])
        sigma_km = rng.uniform(0.01, 0.1)
        cov1 = np.eye(3) * sigma_km ** 2
        cov2 = np.eye(3) * sigma_km ** 2
        fixtures.append({
            "r1": r1, "r2": r2, "v1": v1, "v2": v2,
            "cov1": cov1, "cov2": cov2, "hbr_m": 5.0,
        })
    return fixtures


def run_benchmark(n: int = 20, smoke: bool = False) -> dict:
    if smoke:
        n = 3
    fixtures = synth_conjunctions(n)

    results = {"alfano": [], "chan": [], "foster": [], "patera": [], "monte_carlo": []}
    for fx in fixtures:
        kwargs = {
            "r1": fx["r1"], "r2": fx["r2"], "v1": fx["v1"], "v2": fx["v2"],
            "cov1_pos_j2000": fx["cov1"], "cov2_pos_j2000": fx["cov2"],
            "hbr_m": fx["hbr_m"],
        }
        results["alfano"].append(pc_alfano2004(**kwargs))
        results["chan"].append(pc_chan(**kwargs))
        results["foster"].append(pc_foster(**kwargs, n_rings=20, n_angles=36))
        results["patera"].append(pc_patera(**kwargs))
        results["monte_carlo"].append(pc_monte_carlo(**kwargs, n_samples=10_000))

    mc = np.array(results["monte_carlo"])
    rates = {}
    for method in ("alfano", "chan", "foster", "patera"):
        m = np.array(results[method])
        # Match within 50% (Monte Carlo is noisy at low Pc)
        valid = mc > 1e-6
        if valid.any():
            relerr = np.abs(m[valid] - mc[valid]) / np.maximum(mc[valid], 1e-10)
            rates[method] = {
                "median_rel_err": float(np.median(relerr)),
                "p95_rel_err": float(np.quantile(relerr, 0.95)),
            }
    return {"n_fixtures": len(fixtures), "rates": rates}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--smoke", action="store_true")
    p.add_argument("-n", type=int, default=20)
    args = p.parse_args()
    result = run_benchmark(args.n, smoke=args.smoke)
    print("B3 — Pc method correctness")
    print(f"  n_fixtures: {result['n_fixtures']}")
    for method, r in result["rates"].items():
        print(f"  {method}: median_rel_err = {r['median_rel_err']:.3f}, p95_rel_err = {r['p95_rel_err']:.3f}")


if __name__ == "__main__":
    main()
