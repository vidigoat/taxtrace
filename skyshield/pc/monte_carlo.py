"""Monte Carlo Pc — slow oracle, used for validation only.

Samples N realizations from the combined Gaussian and counts the fraction that
fall within the hard-body sphere. With N = 1,000,000 samples, accuracy is
~1e-6 absolute (per the Wilson confidence interval).

DO NOT use in production. Run only for validation.
"""

from __future__ import annotations

import numpy as np

from skyshield.pc.covariance import combine_covariance


def pc_monte_carlo(
    *,
    r1: np.ndarray,
    r2: np.ndarray,
    v1: np.ndarray,
    v2: np.ndarray,
    cov1_pos_j2000: np.ndarray,
    cov2_pos_j2000: np.ndarray,
    hbr_m: float,
    n_samples: int = 200_000,
    seed: int = 42,
) -> float:
    """Monte Carlo estimate of Pc.

    Samples the relative position distribution at TCA (assumed Gaussian with
    mean = r2 - r1 and covariance = cov1 + cov2) and counts hits inside the
    hard-body sphere.
    """
    r1 = np.asarray(r1, dtype=np.float64).reshape(3)
    r2 = np.asarray(r2, dtype=np.float64).reshape(3)
    cov_combined = combine_covariance(cov1_pos_j2000, cov2_pos_j2000)
    miss = r2 - r1
    rho_km = hbr_m / 1000.0

    rng = np.random.default_rng(seed)
    try:
        L = np.linalg.cholesky(cov_combined)
    except np.linalg.LinAlgError:
        # Try eigendecomposition for marginally PSD covariance
        eigvals, eigvecs = np.linalg.eigh(cov_combined)
        eigvals = np.clip(eigvals, 1e-12, None)
        L = eigvecs @ np.diag(np.sqrt(eigvals))

    samples = rng.standard_normal((n_samples, 3)) @ L.T
    # Offset by miss (relative position mean)
    samples += miss
    distances = np.linalg.norm(samples, axis=1)
    hits = int(np.sum(distances < rho_km))
    return float(hits / n_samples)
