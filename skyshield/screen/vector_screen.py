"""Vectorized screener — the production hot path.

Replaces the Python-loop screener in `smart_screen.py` with a vectorized
implementation that:

  1. Precomputes ALL OCM positions as a single (N_obj, N_t, 3) NumPy tensor.
  2. Does pairwise distance computation via broadcast (no Python loops).
  3. Applies the apogee-perigee filter as a boolean (N, N) mask once.
  4. Finds (epoch, distance) samples within the screening volume for each pair
     in vectorized fashion.
  5. Identifies local minima per pair and emits CandidatePair objects with
     a swept-volume bridge check between samples (catches fast flybys).

Target speedup: 100× minimum on CPU, 1000× on a single GPU.
This is what unlocks the full 26K-OCM benchmark.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np

from skyshield.propagate.ephemeris import apogee_perigee, batch_interp_state
from skyshield.propagate.ocm import OCM
from skyshield.screen.smart_screen import CandidatePair


def vector_screen(
    ocms: list[OCM],
    *,
    window_start: datetime,
    window_end: datetime,
    screening_radius_km: float = 10.0,
    time_step_seconds: float = 60.0,
    swept_volume_check: bool = True,
) -> list[CandidatePair]:
    """Vectorized end-to-end conjunction screening.

    Differences from `smart_screen`:
      - Position tensor is precomputed once for all OCMs at all sample times.
      - Pairwise distance matrix built as `np.linalg.norm(pos[:, None] - pos[None, :], axis=-1)`
        which compiles to a single BLAS call.
      - Swept-volume check uses velocity at each sample to test whether a pair
        could have come within the screening radius BETWEEN samples — catches
        fast flybys that escape discrete sampling.

    Parameters mirror `smart_screen.smart_screen`.
    """
    if not ocms:
        return []

    n_obj = len(ocms)
    sat_ids = [ocm.sat_id for ocm in ocms]

    # ---- Stage 1: apogee-perigee filter (cheap; (N, N) boolean mask) ----
    apos = np.zeros(n_obj)
    peris = np.zeros(n_obj)
    for i, ocm in enumerate(ocms):
        mat = ocm.state_matrix()
        if mat.size > 0:
            apos[i], peris[i] = apogee_perigee(mat)

    # Pad by screening radius (object can be displaced by this much from mean orbit)
    pad = screening_radius_km
    max_peri = np.maximum(peris[:, None], peris[None, :]) - pad
    min_apo = np.minimum(apos[:, None], apos[None, :]) + pad
    survives_ap = max_peri <= min_apo
    np.fill_diagonal(survives_ap, False)

    # If fewer than 2 objects survive any filter, bail
    if not np.any(survives_ap):
        return []

    # ---- Stage 2: precompute position + velocity tensors via vectorized interp ----
    n_steps = int((window_end - window_start).total_seconds() / time_step_seconds) + 1
    times = [window_start + timedelta(seconds=k * time_step_seconds) for k in range(n_steps)]

    positions = np.full((n_obj, n_steps, 3), np.nan, dtype=np.float64)
    velocities = np.full((n_obj, n_steps, 3), np.nan, dtype=np.float64)

    # Each OCM gets one vectorized call (no Python loop over time)
    for i, ocm in enumerate(ocms):
        if not ocm.states:
            continue
        p, v = batch_interp_state(ocm, times)
        positions[i] = p
        velocities[i] = v

    # Boolean: which (object, time) cells are active (not NaN)
    active = ~np.isnan(positions[:, :, 0])  # (N, T)

    # ---- Stage 3: vectorized pairwise distances per time step ----
    # We collect (epoch_idx, i, j, distance) for all pairs within screening_radius_km.
    # To keep memory in check, we process one time step at a time but use NumPy broadcast.
    pair_samples: dict[tuple[int, int], list[tuple[datetime, float]]] = {}
    sr2 = screening_radius_km * screening_radius_km

    for k in range(n_steps):
        active_k = active[:, k]
        n_active = int(active_k.sum())
        if n_active < 2:
            continue
        idx_active = np.where(active_k)[0]
        pos_k = positions[idx_active, k]  # (M, 3)

        # Pairwise sq distances: (M, M)
        # Use the identity ||a-b||^2 = ||a||^2 + ||b||^2 - 2 a.b for speed.
        sq_norms = np.sum(pos_k * pos_k, axis=1)
        dot = pos_k @ pos_k.T
        d2 = sq_norms[:, None] + sq_norms[None, :] - 2 * dot
        np.fill_diagonal(d2, np.inf)
        # Find pairs within radius
        within = d2 <= sr2

        # Apogee-perigee mask restricted to active subset
        ap_sub = survives_ap[np.ix_(idx_active, idx_active)]
        within &= ap_sub

        # Upper triangle only (avoid duplicates)
        within = np.triu(within, k=1)

        ii, jj = np.where(within)
        if ii.size == 0:
            continue
        d_pairs = np.sqrt(d2[ii, jj])
        for pi, pj, d_val in zip(ii, jj, d_pairs, strict=False):
            i_g = int(idx_active[pi])
            j_g = int(idx_active[pj])
            id_i = sat_ids[i_g]
            id_j = sat_ids[j_g]
            key = (min(id_i, id_j), max(id_i, id_j))
            pair_samples.setdefault(key, []).append((times[k], float(d_val)))

    # ---- Stage 4: swept-volume between-sample check (catches fast flybys) ----
    # Only check (pair, interval) combinations where the pair is "near" each other
    # at one of the bracketing time samples — within `bridge_radius`. This avoids
    # the O(N^2 * T) all-pair-all-time scan.
    if swept_volume_check:
        bridge_radius = max(2.5 * screening_radius_km, screening_radius_km + 50.0)
        br2 = bridge_radius * bridge_radius

        for k in range(n_steps - 1):
            # Pairs that are within `bridge_radius` at either endpoint
            active_now = active[:, k]
            active_next = active[:, k + 1]
            both_active = active_now & active_next
            if both_active.sum() < 2:
                continue
            idx_a = np.where(both_active)[0]
            p0 = positions[idx_a, k]      # (M, 3)
            p1 = positions[idx_a, k + 1]
            v0 = velocities[idx_a, k]
            # v1 deliberately omitted — within-interval linear motion uses v0 only

            # Distance matrix at sample k
            sq_norms_k = (p0 * p0).sum(axis=1)
            dot_k = p0 @ p0.T
            d2_k = sq_norms_k[:, None] + sq_norms_k[None, :] - 2 * dot_k
            np.fill_diagonal(d2_k, np.inf)
            close_now = d2_k <= br2

            # Distance matrix at sample k+1
            sq_norms_k1 = (p1 * p1).sum(axis=1)
            dot_k1 = p1 @ p1.T
            d2_k1 = sq_norms_k1[:, None] + sq_norms_k1[None, :] - 2 * dot_k1
            np.fill_diagonal(d2_k1, np.inf)
            close_next = d2_k1 <= br2

            close_any = close_now | close_next
            # Apogee-perigee filter (apply to active subset)
            ap_sub = survives_ap[np.ix_(idx_a, idx_a)]
            close_any &= ap_sub
            # Upper triangle only
            close_any = np.triu(close_any, k=1)

            ii, jj = np.where(close_any)
            if ii.size == 0:
                continue

            # Vectorized swept-volume minimum for these candidate pairs
            r0_rel = p0[jj] - p0[ii]            # (P, 3)
            v0_rel = v0[jj] - v0[ii]
            v_sq = (v0_rel * v0_rel).sum(axis=1)
            t_star = np.zeros_like(v_sq)
            mask_vs = v_sq > 1e-12
            t_star[mask_vs] = -(r0_rel[mask_vs] * v0_rel[mask_vs]).sum(axis=1) / v_sq[mask_vs]
            dt = time_step_seconds
            interior = mask_vs & (t_star > 0) & (t_star < dt)
            if not interior.any():
                continue

            t_clip = np.clip(t_star, 0.0, dt)
            r_min = r0_rel + v0_rel * t_clip[:, None]
            d_min = np.linalg.norm(r_min, axis=1)
            within = interior & (d_min <= screening_radius_km)
            if not within.any():
                continue

            sel = np.where(within)[0]
            for s in sel:
                i_g = int(idx_a[ii[s]])
                j_g = int(idx_a[jj[s]])
                t_min_epoch = times[k] + timedelta(seconds=float(t_star[s]))
                id_i = sat_ids[i_g]
                id_j = sat_ids[j_g]
                key = (min(id_i, id_j), max(id_i, id_j))
                pair_samples.setdefault(key, []).append((t_min_epoch, float(d_min[s])))

    # ---- Stage 5: local-minima detection per pair ----
    candidates: list[CandidatePair] = []
    min_gap_seconds = 1800.0  # 30 min between distinct events
    for key, samples in pair_samples.items():
        samples.sort(key=lambda s: s[0])
        n = len(samples)
        last_emitted: datetime | None = None
        for k in range(n):
            t_k, d_k = samples[k]
            is_min = True
            if k > 0 and samples[k - 1][1] < d_k:
                is_min = False
            if k < n - 1 and samples[k + 1][1] < d_k:
                is_min = False
            if not is_min:
                continue
            if last_emitted is not None and (t_k - last_emitted).total_seconds() < min_gap_seconds:
                # Same event window — keep the deeper minimum
                same_pair = (
                    candidates
                    and candidates[-1].obj1_id == key[0]
                    and candidates[-1].obj2_id == key[1]
                )
                if same_pair and d_k < candidates[-1].approx_min_range_km:
                    candidates[-1] = CandidatePair(
                        obj1_id=key[0],
                        obj2_id=key[1],
                        approx_min_range_km=d_k,
                        approx_tca=t_k,
                    )
                    last_emitted = t_k
                continue
            candidates.append(CandidatePair(
                obj1_id=key[0],
                obj2_id=key[1],
                approx_min_range_km=d_k,
                approx_tca=t_k,
            ))
            last_emitted = t_k

    return sorted(candidates, key=lambda c: (c.obj1_id, c.obj2_id, c.approx_tca))
