"""B1 — Propagation throughput benchmark.

Measures how many satellite × timestep propagations we can do per second.
Target: full Starlink (9,341 sats) × 1,000 steps in under 10ms on A100.
"""

from __future__ import annotations

import argparse
from time import perf_counter

import jax
import jax.numpy as jnp
import numpy as np


def run_benchmark(n_satellites: int = 1000, n_steps: int = 100, smoke: bool = False) -> dict:
    """Run the propagation throughput benchmark."""
    if smoke:
        n_satellites = 100
        n_steps = 10

    # Build synthetic batch of orbital elements (LEO-like)
    rng = np.random.default_rng(42)
    no_kozai = rng.uniform(0.06, 0.08, n_satellites)         # rad/min ~ 15 rev/day
    ecco = rng.uniform(0.0, 0.01, n_satellites)
    inclo = rng.uniform(np.radians(40), np.radians(60), n_satellites)
    nodeo = rng.uniform(0, 2 * np.pi, n_satellites)
    argpo = rng.uniform(0, 2 * np.pi, n_satellites)
    mo = rng.uniform(0, 2 * np.pi, n_satellites)
    bstar = rng.uniform(-1e-4, 1e-4, n_satellites)

    elements = {
        "no_kozai": jnp.asarray(no_kozai),
        "ecco": jnp.asarray(ecco),
        "inclo": jnp.asarray(inclo),
        "nodeo": jnp.asarray(nodeo),
        "argpo": jnp.asarray(argpo),
        "mo": jnp.asarray(mo),
        "bstar": jnp.asarray(bstar),
    }
    t_minutes = jnp.linspace(0.0, 1440.0, n_steps)

    from skyshield.propagate.sgp4_jax import propagate_batch

    # Warm-up JIT
    _ = propagate_batch(elements, t_minutes)
    jax.block_until_ready(_)

    # Timed run
    t0 = perf_counter()
    r, v = propagate_batch(elements, t_minutes)
    jax.block_until_ready(r)
    elapsed = perf_counter() - t0

    n_total = n_satellites * n_steps
    rate = n_total / elapsed
    return {
        "n_satellites": n_satellites,
        "n_steps": n_steps,
        "total_propagations": n_total,
        "elapsed_seconds": elapsed,
        "props_per_second": rate,
        "ms_per_million_props": 1e3 / (rate / 1e6) if rate > 0 else float("inf"),
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--smoke", action="store_true", help="Tiny smoke-test run for CI")
    p.add_argument("--n-satellites", type=int, default=1000)
    p.add_argument("--n-steps", type=int, default=100)
    args = p.parse_args()
    result = run_benchmark(args.n_satellites, args.n_steps, args.smoke)
    print("B1 — Propagation throughput")
    for k, v in result.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
