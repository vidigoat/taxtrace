"""Covariance utilities for the conjunction Pc problem.

The Pc problem reduces to a 2D Gaussian integral in the *encounter plane*: the
plane perpendicular to the relative velocity at TCA. We:
  1. Combine the two objects' 3D position covariances (sum of independent Gaussians)
  2. Project the combined covariance into the encounter plane (orthogonal projection)
  3. Diagonalize to get principal axes (semi-major/minor of the uncertainty ellipse)

These steps are shared across Alfano, Chan, Foster, and Patera methods.
"""

from __future__ import annotations

import numpy as np


def encounter_plane_basis(v_rel: np.ndarray) -> np.ndarray:
    """Compute an orthonormal basis (e1, e2, e3) where e3 is along v_rel.

    Returns a 3x3 matrix whose rows are e1, e2, e3.
    The encounter plane is spanned by (e1, e2).
    """
    v = np.asarray(v_rel, dtype=np.float64).reshape(3)
    v_norm = np.linalg.norm(v)
    if v_norm < 1e-12:
        raise ValueError("Relative velocity has zero magnitude; encounter plane undefined")
    e3 = v / v_norm
    # Build e1 orthogonal to e3 via Gram-Schmidt on a non-parallel reference vector
    ref = np.array([1.0, 0.0, 0.0])
    if abs(np.dot(ref, e3)) > 0.95:
        ref = np.array([0.0, 1.0, 0.0])
    e1 = ref - np.dot(ref, e3) * e3
    e1 = e1 / np.linalg.norm(e1)
    e2 = np.cross(e3, e1)
    return np.stack([e1, e2, e3])


def combine_covariance(cov1_pos: np.ndarray, cov2_pos: np.ndarray) -> np.ndarray:
    """Sum two 3x3 position covariance matrices (Gaussians add by sum of covariances)."""
    c1 = np.asarray(cov1_pos, dtype=np.float64)
    c2 = np.asarray(cov2_pos, dtype=np.float64)
    if c1.shape != (3, 3):
        raise ValueError(f"cov1_pos must be 3x3, got {c1.shape}")
    if c2.shape != (3, 3):
        raise ValueError(f"cov2_pos must be 3x3, got {c2.shape}")
    return c1 + c2


def project_to_encounter_plane(
    cov_combined: np.ndarray, v_rel: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Project a 3x3 covariance into the 2D encounter plane.

    Returns
    -------
    cov_2d : (2, 2) covariance in the (e1, e2) basis
    basis : (3, 3) rows = (e1, e2, e3)
    """
    basis = encounter_plane_basis(v_rel)
    # Rotate covariance into the basis
    cov_rot = basis @ cov_combined @ basis.T
    return cov_rot[:2, :2], basis


def project_position(miss_vector: np.ndarray, v_rel: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Project a 3D miss vector into the encounter-plane (e1, e2) coordinates."""
    basis = encounter_plane_basis(v_rel)
    rotated = basis @ miss_vector
    return rotated[:2], basis


def diagonalize_2x2(cov_2d: np.ndarray) -> tuple[float, float, float]:
    """Diagonalize a 2x2 symmetric covariance.

    Returns
    -------
    sigma_x, sigma_y : float
        Standard deviations along the principal axes (sigma_x >= sigma_y).
    rotation : float
        Angle (rad) to rotate the input frame into principal-axis frame.
    """
    cov = np.asarray(cov_2d, dtype=np.float64)
    eigvals, eigvecs = np.linalg.eigh(cov)
    # eigh returns ascending — flip for descending
    order = np.argsort(eigvals)[::-1]
    sigma_x = float(np.sqrt(max(eigvals[order[0]], 0.0)))
    sigma_y = float(np.sqrt(max(eigvals[order[1]], 0.0)))
    v_major = eigvecs[:, order[0]]
    rotation = float(np.arctan2(v_major[1], v_major[0]))
    return sigma_x, sigma_y, rotation


def mahalanobis_distance(miss: np.ndarray, cov_combined: np.ndarray) -> float:
    """Compute the Mahalanobis distance for the conjunction.

    Per TraCSS answer-key column 11 (`mdistance`).
    """
    miss = np.asarray(miss, dtype=np.float64).reshape(-1)
    try:
        inv = np.linalg.inv(cov_combined)
    except np.linalg.LinAlgError:
        return float("nan")
    return float(np.sqrt(miss @ inv @ miss))


def is_covariance_robust(
    cov_combined: np.ndarray, hbr_m: float, miss_distance_km: float
) -> int:
    """Determine the `dilution` flag per TraCSS answer-key column 10.

    0 = robust covariance (left side of max Pc on Pc-vs-scale curve)
    1 = diluted covariance (right side)

    We approximate by checking whether the 3-sigma ellipsoid extent is small
    relative to the miss distance; if not, we're in the diluted regime.
    """
    try:
        eigs = np.linalg.eigvalsh(cov_combined)
    except np.linalg.LinAlgError:
        return 1
    if (eigs <= 0).any():
        return 1
    max_sigma_km = float(np.sqrt(np.max(eigs)))
    # Heuristic: 3-sigma uncertainty larger than miss => diluted regime
    return 1 if (3.0 * max_sigma_km > max(miss_distance_km, 1e-6)) else 0
