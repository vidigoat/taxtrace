"""B2 — Screening throughput benchmark.

Measures the speedup of the octree screening vs naive O(N²) all-pairs.
Target: >1000× speedup at N=30,000.
"""

from __future__ import annotations

import argparse
from time import perf_counter

import numpy as np

from skyshield.screen.octree import build_octree, octree_candidate_pairs


def naive_pairs(positions: np.ndarray, screening_radius_km: float) -> int:
    """Naive O(N²) implementation for comparison."""
    n = positions.shape[0]
    count = 0
    for i in range(n):
        for j in range(i + 1, n):
            d = np.linalg.norm(positions[i] - positions[j])
            if d <= screening_radius_km:
                count += 1
    return count


def run_benchmark(n_objects: int = 1000, screening_radius_km: float = 10.0, smoke: bool = False) -> dict:
    if smoke:
        n_objects = 100

    rng = np.random.default_rng(42)
    # LEO shell: ~6800 km from center, spread over a wide range
    radii = rng.uniform(6700, 7200, n_objects)
    theta = rng.uniform(0, np.pi, n_objects)
    phi = rng.uniform(0, 2 * np.pi, n_objects)
    positions = np.column_stack([
        radii * np.sin(theta) * np.cos(phi),
        radii * np.sin(theta) * np.sin(phi),
        radii * np.cos(theta),
    ])

    # Octree
    t0 = perf_counter()
    root = build_octree(positions, leaf_size=16)
    pairs = octree_candidate_pairs(root, positions, screening_radius_km=screening_radius_km)
    t_octree = perf_counter() - t0

    # Naive (only for small N — too slow for 30K)
    if n_objects <= 5000:
        t0 = perf_counter()
        naive_count = naive_pairs(positions, screening_radius_km)
        t_naive = perf_counter() - t0
        speedup = t_naive / t_octree if t_octree > 0 else float("inf")
    else:
        naive_count = None
        t_naive = None
        speedup = None

    return {
        "n_objects": n_objects,
        "screening_radius_km": screening_radius_km,
        "octree_pairs": len(pairs),
        "naive_pairs": naive_count,
        "octree_seconds": t_octree,
        "naive_seconds": t_naive,
        "speedup": speedup,
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--smoke", action="store_true")
    p.add_argument("--n-objects", type=int, default=1000)
    args = p.parse_args()
    result = run_benchmark(args.n_objects, smoke=args.smoke)
    print("B2 — Screening throughput")
    for k, v in result.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
