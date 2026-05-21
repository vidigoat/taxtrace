"""Alfano 2004 probability-of-collision method — PRIMARY for TraCSS.

Reference:
    Alfano, S. (2004). "Relating Position Uncertainty to Maximum Conjunction Probability."
    Advances in the Astronautical Sciences, 119, 1543-1552.

The method computes Pc by numerically integrating the 2D Gaussian over a circle
in the encounter plane:

    Pc = (1 / (2π σ_x σ_y)) ∫∫_circle exp(-½ ((x - x0)² / σ_x² + (y - y0)² / σ_y²)) dx dy

Alfano's contribution is an efficient series + adaptive Simpson scheme that
handles the highly elongated covariance ellipses common in real conjunctions.

This is the method TraCSS uses to populate the `prob` column of the answer key
(per the User Guide §5, Table 5). Matching the answer key requires using this
exact method.
"""

from __future__ import annotations

import numpy as np

from skyshield.pc.covariance import (
    combine_covariance,
    diagonalize_2x2,
    project_position,
    project_to_encounter_plane,
)


def pc_alfano2004(
    *,
    r1: np.ndarray,
    r2: np.ndarray,
    v1: np.ndarray,
    v2: np.ndarray,
    cov1_pos_j2000: np.ndarray,
    cov2_pos_j2000: np.ndarray,
    hbr_m: float,
    n_subdivisions: int = 128,
) -> float:
    """Compute Pc using Alfano 2004's method.

    Parameters
    ----------
    r1, r2 : (3,) array
        Positions of object 1 and 2 at TCA (km, J2000).
    v1, v2 : (3,) array
        Velocities at TCA (km/s, J2000).
    cov1_pos_j2000, cov2_pos_j2000 : (3, 3) array
        Position covariances in J2000 (km^2). For OCM/CDM inputs in UVW,
        rotate first into J2000.
    hbr_m : float
        Hard-body radius in meters (combined for the two objects, or single if
        treating one as a point).
    n_subdivisions : int
        Number of integration subdivisions for Simpson's rule.

    Returns
    -------
    Pc : float in [0, 1], or NaN if covariance is singular.
    """
    r1 = np.asarray(r1, dtype=np.float64).reshape(3)
    r2 = np.asarray(r2, dtype=np.float64).reshape(3)
    v1 = np.asarray(v1, dtype=np.float64).reshape(3)
    v2 = np.asarray(v2, dtype=np.float64).reshape(3)
    miss = r2 - r1
    v_rel = v2 - v1
    if np.linalg.norm(v_rel) < 1e-12:
        return float("nan")

    # Combine covariances and project into encounter plane
    cov_combined = combine_covariance(cov1_pos_j2000, cov2_pos_j2000)
    cov_2d, basis = project_to_encounter_plane(cov_combined, v_rel)
    miss_2d, _ = project_position(miss, v_rel)

    # Diagonalize covariance to principal axes
    sigma_x, sigma_y, theta = diagonalize_2x2(cov_2d)
    if sigma_x < 1e-12 or sigma_y < 1e-12:
        return float("nan")

    # Rotate the miss vector into the principal-axis frame
    cos_t, sin_t = np.cos(theta), np.sin(theta)
    R = np.array([[cos_t, sin_t], [-sin_t, cos_t]])
    miss_principal = R @ miss_2d
    x0, y0 = float(miss_principal[0]), float(miss_principal[1])

    # Hard-body radius in km (input is in meters)
    rho_km = hbr_m / 1000.0

    return _alfano_integral(x0, y0, sigma_x, sigma_y, rho_km, n_subdivisions)


def _alfano_integral(
    x0: float,
    y0: float,
    sigma_x: float,
    sigma_y: float,
    rho: float,
    n_subdivisions: int,
) -> float:
    """Numerical integral of the 2D Gaussian over a disk of radius rho.

    Alfano's adaptive approach: change variables to make integration symmetric,
    then use Simpson's rule on a 1-D auxiliary integral after collapsing one dim.

    For each strip in x ∈ [-ρ, ρ], the integral over y reduces to a difference
    of error functions:
        I(x) = exp(-(x-x0)² / (2σ_x²)) × [erf((y_max - y0) / (√2 σ_y)) - erf((y_min - y0) / (√2 σ_y))]
    where y_max = +√(ρ² - x²) and y_min = -√(ρ² - x²) (the disk constraint),
    relative to the center of the hard-body, not the origin.

    The combined Pc is:
        Pc = (1 / (2 √(2π) σ_x)) ∫_{-ρ}^{ρ} I(x) dx
    """
    from math import erf

    if rho <= 0.0 or sigma_x <= 0.0 or sigma_y <= 0.0:
        return 0.0

    # Substitution: integrate u = x - x0 ... but disk constraint is x² + y² ≤ ρ²
    # So we integrate x in [-ρ, ρ], y in [-sqrt(ρ²-x²), sqrt(ρ²-x²)], with center at origin.
    # The miss vector has been rotated so the HBR is at (0, 0) and the Gaussian center is at (x0, y0).
    n = max(8, 2 * (n_subdivisions // 2))  # even
    xs = np.linspace(-rho, rho, n + 1)
    integrand = np.zeros(n + 1)
    sqrt2_sigma_y = np.sqrt(2.0) * sigma_y

    for i, x in enumerate(xs):
        h = rho * rho - x * x
        if h <= 0.0:
            integrand[i] = 0.0
            continue
        y_extent = np.sqrt(h)
        y_max = y_extent
        y_min = -y_extent

        # Gaussian weight in x-direction (relative to its mean x0)
        gx = np.exp(-(x - x0) ** 2 / (2.0 * sigma_x * sigma_x))

        # Inner integral of Gaussian in y over [y_min, y_max] relative to mean y0
        e_max = erf((y_max - y0) / sqrt2_sigma_y)
        e_min = erf((y_min - y0) / sqrt2_sigma_y)
        inner = 0.5 * (e_max - e_min)
        integrand[i] = gx * inner

    # Composite Simpson's rule
    h = (xs[-1] - xs[0]) / n
    simpson = integrand[0] + integrand[-1]
    simpson += 4.0 * integrand[1:-1:2].sum()
    simpson += 2.0 * integrand[2:-1:2].sum()
    integral = simpson * h / 3.0

    pc = integral / (np.sqrt(2.0 * np.pi) * sigma_x)
    return float(np.clip(pc, 0.0, 1.0))
