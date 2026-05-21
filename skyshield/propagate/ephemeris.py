"""Ephemeris utilities: interpolation, frame transforms, useable-window filtering.

For the TraCSS benchmark, OCM ephemerides are sampled at discrete epochs but
TCA (time of closest approach) generally falls between samples. We use cubic
Hermite interpolation (state + derivative) which is exact for two-body motion
in the linear approximation and accurate to within a few meters for typical
LEO sampling rates (60-300 sec).
"""

from __future__ import annotations

from datetime import datetime

import numpy as np

from skyshield.propagate.ocm import OCM


def interp_state(
    ocm: OCM, query_epoch: datetime
) -> tuple[np.ndarray, np.ndarray] | None:
    """Cubic Hermite interpolation of position/velocity at a given epoch.

    Returns (r, v) in the OCM's reference frame, or None if `query_epoch` falls
    outside the ephemeris's useable window.
    """
    if ocm.useable_start and query_epoch < ocm.useable_start:
        return None
    if ocm.useable_stop and query_epoch > ocm.useable_stop:
        return None
    if not ocm.states:
        return None

    epochs = np.array([s.epoch.timestamp() for s in ocm.states])
    t = query_epoch.timestamp()

    if t < epochs[0] or t > epochs[-1]:
        return None

    # Find bracketing pair
    idx = int(np.searchsorted(epochs, t)) - 1
    idx = max(0, min(idx, len(epochs) - 2))

    t0 = epochs[idx]
    t1 = epochs[idx + 1]
    h = t1 - t0
    if h <= 0:
        return None

    s0 = ocm.states[idx].as_array()
    s1 = ocm.states[idx + 1].as_array()
    p0, v0 = s0[:3], s0[3:]
    p1, v1 = s1[:3], s1[3:]

    # Cubic Hermite basis on normalized parameter u in [0, 1]
    u = (t - t0) / h
    h00 = 2.0 * u**3 - 3.0 * u**2 + 1.0
    h10 = u**3 - 2.0 * u**2 + u
    h01 = -2.0 * u**3 + 3.0 * u**2
    h11 = u**3 - u**2

    # Position interpolation (with velocity tangents scaled by h)
    p = h00 * p0 + h10 * h * v0 + h01 * p1 + h11 * h * v1

    # Velocity is the derivative of the Hermite polynomial wrt time
    h00d = (6.0 * u**2 - 6.0 * u) / h
    h10d = (3.0 * u**2 - 4.0 * u + 1.0)
    h01d = (-6.0 * u**2 + 6.0 * u) / h
    h11d = (3.0 * u**2 - 2.0 * u)
    v = h00d * p0 + h10d * v0 + h01d * p1 + h11d * v1

    return p, v


def filter_by_od_epoch(
    ocms: list[OCM], screening_window_start: datetime, max_age_days: float = 14.0
) -> list[OCM]:
    """Filter OCMs by OD epoch age per TraCSS User Guide §4.4."""
    return [ocm for ocm in ocms if ocm.od_age_days(screening_window_start) < max_age_days]


def filter_by_useable_window(
    ocms: list[OCM], window_start: datetime, window_end: datetime
) -> list[OCM]:
    """Drop OCMs whose useable window is entirely outside the screening window."""
    out = []
    for ocm in ocms:
        us = ocm.useable_start
        ue = ocm.useable_stop
        # Keep if there's any temporal overlap
        if (us is None or us <= window_end) and (ue is None or ue >= window_start):
            out.append(ocm)
    return out


def apogee_perigee(states: np.ndarray) -> tuple[float, float]:
    """Estimate apogee and perigee from an ephemeris state matrix.

    Parameters
    ----------
    states : ndarray (N, 6)
        [x, y, z, vx, vy, vz] rows.

    Returns
    -------
    (apogee_km, perigee_km) : tuple of floats
        Geocentric distance at apogee and perigee.

    For ephemerides spanning much less than one orbital period, this returns
    (max_r, min_r) over the available samples — useful as a coarse filter for
    apogee-perigee screening even on partial orbits.
    """
    if states.size == 0:
        return 0.0, 0.0
    rs = np.linalg.norm(states[:, :3], axis=1)
    return float(np.max(rs)), float(np.min(rs))
