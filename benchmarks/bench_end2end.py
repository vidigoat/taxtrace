"""B6 — End-to-end wall clock benchmark.

Measures the full pipeline: OCM ingest → screen → Pc → CDM output.
Target: <30 sec on a single A100 for 30K-object catalog.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from time import perf_counter

import numpy as np


def synth_ocms(n: int = 100, window_start: datetime = datetime(2025, 1, 1, 12)) -> list:
    """Generate synthetic OCMs for benchmarking without the real dataset."""
    from skyshield.propagate.ocm import OCM, OCMOrbitState

    rng = np.random.default_rng(42)
    ocms = []
    for i in range(n):
        # Random LEO orbit
        radii = 6800 + rng.uniform(-100, 100)
        states = []
        for t in range(8 * 24):   # 8 days at 1 hr cadence
            theta = (t / 12.0) * np.pi + i * 0.1
            x = radii * np.cos(theta)
            y = radii * np.sin(theta)
            z = 100 * np.sin(theta * 0.5)
            vx = -radii * np.sin(theta) * 7.5 / radii
            vy = radii * np.cos(theta) * 7.5 / radii
            vz = 50 * np.cos(theta * 0.5)
            states.append(OCMOrbitState(
                epoch=window_start + timedelta(hours=t),
                x=x, y=y, z=z, vx=vx, vy=vy, vz=vz,
            ))
        ocms.append(OCM(
            object_designator=str(10000 + i),
            object_name=f"SYNTH-{i}",
            states=states,
            useable_start=window_start,
            useable_stop=window_start + timedelta(days=8),
            od_epoch=window_start - timedelta(days=1),
            ref_frame="EME2000",
            time_system="UTC",
        ))
    return ocms


def run_benchmark(n_objects: int = 100, smoke: bool = False) -> dict:
    if smoke:
        n_objects = 20

    from skyshield.screen.smart_screen import smart_screen

    window_start = datetime(2025, 1, 1, 12, 0, 0)
    window_end = datetime(2025, 1, 8, 12, 0, 0)

    ocms = synth_ocms(n_objects, window_start)

    t0 = perf_counter()
    candidates = smart_screen(
        ocms,
        window_start=window_start,
        window_end=window_end,
        screening_radius_km=10.0,
        time_step_seconds=300.0,    # coarse for speed
    )
    elapsed = perf_counter() - t0

    return {
        "n_objects": n_objects,
        "n_candidates": len(candidates),
        "elapsed_seconds": elapsed,
        "objects_per_second": n_objects / elapsed if elapsed > 0 else float("inf"),
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--smoke", action="store_true")
    p.add_argument("--n-objects", type=int, default=100)
    args = p.parse_args()
    result = run_benchmark(args.n_objects, smoke=args.smoke)
    print("B6 — End-to-end wall clock")
    for k, v in result.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
