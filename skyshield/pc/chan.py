"""Chan 1997 series-based Pc method.

Reference:
    Chan, F. K. (1997). "Collision Probability Analyses for Earth-Orbiting Satellites."
    Spaceflight Dynamics 1997, AAS 97-628.

Chan transforms the 2D Gaussian integral over the hard-body disk into a series
that converges rapidly (typically 3-5 terms). Faster than Alfano's adaptive
integration; matches Monte Carlo within ~1% for typical conjunction geometries.

We use Chan as a faster alternative for production runs and for cross-validation
of Alfano's results. The TraCSS answer key uses Alfano, so Chan is secondary.
"""

from __future__ import annotations

import numpy as np

from skyshield.pc.covariance import (
    combine_covariance,
    diagonalize_2x2,
    project_position,
    project_to_encounter_plane,
)


def pc_chan(
    *,
    r1: np.ndarray,
    r2: np.ndarray,
    v1: np.ndarray,
    v2: np.ndarray,
    cov1_pos_j2000: np.ndarray,
    cov2_pos_j2000: np.ndarray,
    hbr_m: float,
    n_terms: int = 10,
) -> float:
    """Compute Pc via Chan's series method.

    Chan's formula (in principal-axis frame of the encounter-plane covariance):

        Pc = e^{-v/2} × Σ_{k=0}^∞ (v/2)^k / k! × P(k+1, u/2)

    where:
        u = ρ² / σ_x σ_y  (dimensionless hard-body parameter)
        v = (x₀² σ_y / σ_x + y₀² σ_x / σ_y) / (σ_x σ_y)
        ρ = hard-body radius
        P(k, x) = regularized lower incomplete gamma function

    For computational stability we use the recursive form.
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
    u = rho_km * rho_km / (sigma_x * sigma_y)
    v = (x0 * x0 * sigma_y / sigma_x + y0 * y0 * sigma_x / sigma_y) / (sigma_x * sigma_y)

    # Chan's series: Pc = exp(-v/2) * sum_{k=0}^N [ (v/2)^k / k! ] * G(k+1, u/2)
    # where G is the regularized lower incomplete gamma function P(k+1, u/2).
    # P(k+1, u/2) = 1 - exp(-u/2) * sum_{j=0}^k (u/2)^j / j!
    from math import factorial
    half_u = u / 2.0
    half_v = v / 2.0
    pc = 0.0
    # Pre-compute terms
    fac_k = 1.0
    v_pow = 1.0
    # P(k+1, u/2) initial (k=0): P(1, u/2) = 1 - exp(-u/2)
    Pk = 1.0 - np.exp(-half_u)
    sum_uj = 1.0
    for k in range(n_terms):
        if k > 0:
            sum_uj += half_u ** k / float(factorial(k))
            Pk = 1.0 - np.exp(-half_u) * sum_uj
            v_pow *= half_v
            fac_k *= k
        term = v_pow / fac_k * Pk
        pc += term
        if abs(term) < 1e-15 and k > 3:
            break
    pc *= np.exp(-half_v)

    return float(np.clip(pc, 0.0, 1.0))
