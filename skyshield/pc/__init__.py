"""Probability of Collision (Pc) computation.

Multiple closed-form methods are provided. Per the TraCSS User Guide §5 (Table 5),
the answer-key `prob` column is computed via Alfano 2004 — so that's our PRIMARY
method. Chan, Foster, and Patera are provided for cross-validation and as faster
alternatives in production. Monte Carlo serves as an oracle for accuracy testing.

All methods assume:
  - Short-encounter (constant relative velocity at TCA)
  - Gaussian position uncertainty
  - Hard-body radius (spherical or projected onto encounter plane)
"""

from skyshield.pc.alfano import pc_alfano2004
from skyshield.pc.chan import pc_chan
from skyshield.pc.covariance import (
    combine_covariance,
    encounter_plane_basis,
    project_to_encounter_plane,
)
from skyshield.pc.foster import pc_foster
from skyshield.pc.monte_carlo import pc_monte_carlo
from skyshield.pc.patera import pc_patera

__all__ = [
    "combine_covariance",
    "encounter_plane_basis",
    "pc_alfano2004",
    "pc_chan",
    "pc_foster",
    "pc_monte_carlo",
    "pc_patera",
    "project_to_encounter_plane",
]
