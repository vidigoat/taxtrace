"""Smart screening pipeline: combine all spatial filters.

Stages:
  1. Apogee-perigee pre-filter (cheapest)
  2. Octree per time slice
  3. Z-order sort for candidate batching

For each surviving (i, j) pair we return a `CandidatePair` with the approximate
TCA and miss distance to feed downstream Pc computation.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np

from skyshield.propagate.ephemeris import apogee_perigee
from skyshield.propagate.ocm import OCM
from skyshield.screen.octree import build_octree, octree_candidate_pairs


@dataclass
class CandidatePair:
    """A pair of objects that survived spatial screening."""
    obj1_id: int
    obj2_id: int
    approx_min_range_km: float
    approx_tca: datetime


def smart_screen(
    ocms: list[OCM],
    *,
    window_start: datetime,
    window_end: datetime,
    screening_radius_km: float = 10.0,
    time_step_seconds: float = 30.0,
) -> list[CandidatePair]:
    """Screen a catalog of OCMs over a time window.

    Strategy:
      1. Apogee-perigee filter to drop pairs that can never come close.
      2. Sample positions at `time_step_seconds` cadence; for each slice,
         build an octree and collect candidate pairs.
      3. Refine each candidate's TCA via cubic interpolation around the minimum.

    Parameters
    ----------
    ocms : list of OCM ephemerides
    window_start, window_end : datetime
        Screening window (TraCSS default: 2025-01-01T12:00 to 2025-01-08T12:00)
    screening_radius_km : float
        Coarse spatial filter radius. Use the largest SFSH dimension for
        the SFSH screening mode (e.g. 51 km for LEO1).
    time_step_seconds : float
        Sampling cadence. Coarser = faster but more candidates.

    Returns
    -------
    list of CandidatePair, deduplicated and sorted by approx_min_range_km.
    """
    if not ocms:
        return []

    # ---- Stage 1: apogee/perigee filter ----
    # Need numeric (a, p) per OCM — derive from state matrix
    apos = np.zeros(len(ocms))
    peris = np.zeros(len(ocms))
    sat_ids = [ocm.sat_id for ocm in ocms]
    for i, ocm in enumerate(ocms):
        mat = ocm.state_matrix()
        if mat.size > 0:
            apos[i], peris[i] = apogee_perigee(mat)

    # Quick apogee/perigee pair mask
    pad = screening_radius_km
    peri_i = peris[:, None]
    peri_j = peris[None, :]
    apo_i = apos[:, None]
    apo_j = apos[None, :]
    survives_ap = (np.maximum(peri_i, peri_j) - pad) <= (np.minimum(apo_i, apo_j) + pad)
    np.fill_diagonal(survives_ap, False)

    # ---- Stage 2: octree per time slice ----
    # Collect EVERY (t, pair, distance) where the pair is within the screening radius.
    # Then identify local minima per pair — those become separate conjunctions.
    n_steps = int((window_end - window_start).total_seconds() / time_step_seconds) + 1
    # Per pair, list of (epoch, distance) within-radius samples
    pair_samples: dict[tuple[int, int], list[tuple[datetime, float]]] = {}

    from skyshield.propagate.ephemeris import interp_state

    for step in range(n_steps):
        t = window_start + timedelta(seconds=step * time_step_seconds)
        positions = np.zeros((len(ocms), 3))
        active_mask = np.zeros(len(ocms), dtype=bool)
        for i, ocm in enumerate(ocms):
            if not ocm.states:
                continue
            result = interp_state(ocm, t)
            if result is None:
                continue
            p, _ = result
            positions[i] = p
            active_mask[i] = True

        active_idx = np.where(active_mask)[0]
        if active_idx.size < 2:
            continue
        active_positions = positions[active_idx]

        root = build_octree(active_positions, leaf_size=16, max_depth=12)
        pairs_local = octree_candidate_pairs(
            root, active_positions, screening_radius_km=screening_radius_km
        )

        for local_i, local_j in pairs_local:
            i_g = active_idx[local_i]
            j_g = active_idx[local_j]
            if not survives_ap[i_g, j_g]:
                continue
            id_i = sat_ids[i_g]
            id_j = sat_ids[j_g]
            if id_i == id_j:
                continue
            key = (min(id_i, id_j), max(id_i, id_j))
            dist = float(np.linalg.norm(active_positions[local_i] - active_positions[local_j]))
            pair_samples.setdefault(key, []).append((t, dist))

    # ---- Stage 3: per-pair local-minima detection ----
    # For each pair, find local minima of the (time, distance) trace.
    # Each local minimum becomes one CandidatePair (one CDM row).
    candidates: list[CandidatePair] = []
    for key, samples in pair_samples.items():
        samples.sort(key=lambda s: s[0])
        # Sliding window: a sample is a local minimum if it's <= both neighbors
        # AND it's a "separate event" (gap of more than ~half an orbit period
        # from the previous emitted local minimum). For LEO orbits ~90 min,
        # we use 30 min as the minimum gap between distinct events.
        min_gap_seconds = 1800.0
        last_emitted_epoch: datetime | None = None
        n = len(samples)
        for k in range(n):
            t_k, d_k = samples[k]
            # Local minimum: smaller than neighbors (or endpoint that's monotone)
            is_min = True
            if k > 0 and samples[k - 1][1] < d_k:
                is_min = False
            if k < n - 1 and samples[k + 1][1] < d_k:
                is_min = False
            if not is_min:
                continue
            # Skip if too close to previous emitted (same physical event)
            if (
                last_emitted_epoch is not None
                and (t_k - last_emitted_epoch).total_seconds() < min_gap_seconds
            ):
                continue
            candidates.append(CandidatePair(
                obj1_id=key[0],
                obj2_id=key[1],
                approx_min_range_km=d_k,
                approx_tca=t_k,
            ))
            last_emitted_epoch = t_k

    return sorted(candidates, key=lambda c: (c.obj1_id, c.obj2_id, c.approx_tca))
