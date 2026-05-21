"""Foster 1992 Pc method (legacy).

Reference:
    Foster, J. L. (1992). "A Parametric Analysis of Orbital Debris Collision
    Probability and Maneuver Rate for Space Vehicles." NASA Johnson Space Center
    technical report JSC-25898.

Foster integrates the encounter-plane Gaussian over the hard-body disk by
breaking the disk into concentric rings and summing analytically. Per the
TraCSS validation paper (Auman 2025), Foster matches Monte Carlo only ~89% of
the time — Chan and Alfano are more accurate. We provide Foster here for
historical comparison and as a sanity check.
"""

from __future__ import annotations

import numpy as np

from skyshield.pc.covariance import (
    combine_covariance,
    diagonalize_2x2,
    project_position,
    project_to_encounter_plane,
)


def pc_foster(
    *,
    r1: np.ndarray,
    r2: np.ndarray,
    v1: np.ndarray,
    v2: np.ndarray,
    cov1_pos_j2000: np.ndarray,
    cov2_pos_j2000: np.ndarray,
    hbr_m: float,
    n_rings: int = 50,
    n_angles: int = 90,
) -> float:
    """Foster's concentric-ring numerical integration of Pc.

    The disk of radius ρ is divided into `n_rings` annuli and `n_angles` angular
    sectors. We sum the Gaussian density at each sector center weighted by area.
    """
    r1 = np.asarray(r1, dtype=np.float64).reshape(3)
    r2 = np.asarray(r2, dtype=np.float64).reshape(3)
    v1 = np.asarray(v1, dtype=np.float64).reshape(3)
    v2 = np.asarray(v2, dtype=np.float64).reshape(3)
    miss = r2 - r1
    v_rel = v2 - v1
    if np.linalg.norm(v_rel) < 1e-12:
        return float("nan")

    cov_combined = combine_covariance(cov1_pos_j2000, cov2_pos_j2000)
    cov_2d, basis = project_to_encounter_plane(cov_combined, v_rel)
    miss_2d, _ = project_position(miss, v_rel)
    sigma_x, sigma_y, theta = diagonalize_2x2(cov_2d)
    if sigma_x < 1e-12 or sigma_y < 1e-12:
        return float("nan")

    cos_t, sin_t = np.cos(theta), np.sin(theta)
    R = np.array([[cos_t, sin_t], [-sin_t, cos_t]])
    miss_principal = R @ miss_2d
    x0, y0 = float(miss_principal[0]), float(miss_principal[1])

    rho_km = hbr_m / 1000.0
    # Build polar grid on the hard-body disk
    r_edges = np.linspace(0.0, rho_km, n_rings + 1)
    r_centers = 0.5 * (r_edges[1:] + r_edges[:-1])
    dr = r_edges[1] - r_edges[0]
    theta_edges = np.linspace(0.0, 2.0 * np.pi, n_angles + 1)
    theta_centers = 0.5 * (theta_edges[1:] + theta_edges[:-1])
    dtheta = theta_edges[1] - theta_edges[0]

    pc = 0.0
    norm = 1.0 / (2.0 * np.pi * sigma_x * sigma_y)
    for r_c in r_centers:
        area = r_c * dr * dtheta
        for th in theta_centers:
            x = r_c * np.cos(th)
            y = r_c * np.sin(th)
            dx = x - x0
            dy = y - y0
            gauss = np.exp(-0.5 * (dx * dx / (sigma_x * sigma_x) + dy * dy / (sigma_y * sigma_y)))
            pc += gauss * area * norm

    return float(np.clip(pc, 0.0, 1.0))
