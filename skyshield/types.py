"""Shared data types used across the SkyShield modules.

Uses Pydantic for runtime validation and schema export. Designed to be JSON-serializable
and JAX-friendly (numeric fields are exposed as plain floats/arrays).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field


class State(BaseModel):
    """Cartesian state vector (position + velocity) in a named reference frame.

    Position in km, velocity in km/s.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    epoch: datetime
    frame: Literal["J2000", "TEME", "ITRF", "UVW"] = "J2000"
    position: tuple[float, float, float] = Field(..., description="(x, y, z) km")
    velocity: tuple[float, float, float] = Field(..., description="(vx, vy, vz) km/s")

    def position_array(self) -> np.ndarray:
        return np.asarray(self.position, dtype=np.float64)

    def velocity_array(self) -> np.ndarray:
        return np.asarray(self.velocity, dtype=np.float64)


class Covariance(BaseModel):
    """6x6 position-velocity covariance matrix (units: km^2, km^2/s, km^2/s^2).

    Stored as 21 unique elements of the upper triangle. Matches TraCSS CDM convention
    where covariance is in UVW (radial / in-track / cross-track) local frame.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    frame: Literal["J2000", "UVW"] = "UVW"
    # Upper-triangular elements, row-major order, 6x6 = 21 elements
    values: list[float] = Field(..., min_length=21, max_length=21)

    def to_matrix(self) -> np.ndarray:
        """Return the full 6x6 symmetric matrix."""
        m = np.zeros((6, 6), dtype=np.float64)
        idx = 0
        for i in range(6):
            for j in range(i, 6):
                m[i, j] = self.values[idx]
                m[j, i] = self.values[idx]
                idx += 1
        return m

    @classmethod
    def from_matrix(cls, m: np.ndarray, frame: str = "UVW") -> Covariance:
        """Create from a full 6x6 symmetric matrix."""
        if m.shape != (6, 6):
            raise ValueError(f"Covariance matrix must be 6x6, got {m.shape}")
        values = []
        for i in range(6):
            for j in range(i, 6):
                values.append(float(m[i, j]))
        return cls(frame=frame, values=values)  # type: ignore[arg-type]


class Object(BaseModel):
    """An orbiting object with an identifier and metadata."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    sat_id: int = Field(..., description="NORAD ID or arbitrary 5-digit for synthetic")
    name: str | None = None
    object_type: Literal["payload", "rocket_body", "debris", "tba", "synthetic"] = "tba"
    hbr_m: float = Field(0.5, description="Hard-body radius in meters")
    # Optional source file for traceability
    source_file: str | None = None


class Ephemeris(BaseModel):
    """A time-series of states for one object."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    sat_id: int
    epochs: list[datetime]
    states: list[State]
    covariances: list[Covariance] | None = None
    useable_start: datetime | None = None
    useable_stop: datetime | None = None
    od_epoch: datetime | None = None
    source_file: str | None = None


class Conjunction(BaseModel):
    """A predicted close approach between two objects, matching TraCSS CDM schema.

    Column names match the answer-key schema from Conjunction_Screening_Testset_Users_Guide.pdf
    Table 5, so we can write directly to the CSV format.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    run_id: int
    conj_id: int
    obj1: int
    met_criteria1: int  # 0 or 1
    obj2: int  # by convention, obj2 > obj1
    met_criteria2: int  # 0 or 1
    min_range: float  # km
    Vrel: float  # km/s
    prob: float | None  # Pc via Alfano 2004 method; None if covariance bad
    dilution: int | None  # 0 = robust, 1 = diluted
    mdistance: float | None  # Mahalanobis distance
    epoch: datetime  # TCA in UTC
    jdate: float  # TCA as Julian date

    # Object 1 state at TCA (J2000)
    x1: float
    y1: float
    z1: float
    vx1: float
    vy1: float
    vz1: float

    # Relative position of obj2 in obj1's UVW frame
    local_x1: float
    local_y1: float
    local_z1: float

    # Lower-triangular matrix elements of Object 1 UVW position covariance.
    # Column names match the official TraCSS answer-key CSV exactly:
    # c1_11 = sigma_xx, c1_12 = sigma_xy, c1_13 = sigma_xz, c1_22 = sigma_yy, ...
    c1_11: float | None
    c1_12: float | None
    c1_13: float | None
    c1_22: float | None
    c1_23: float | None
    c1_33: float | None

    # Object 2 state at TCA (J2000)
    x2: float
    y2: float
    z2: float
    vx2: float
    vy2: float
    vz2: float

    # Relative position of obj1 in obj2's UVW frame
    local_x2: float
    local_y2: float
    local_z2: float

    # Lower-triangular Object 2 UVW position covariance
    c2_11: float | None
    c2_12: float | None
    c2_13: float | None
    c2_22: float | None
    c2_23: float | None
    c2_33: float | None

    # Match answer-key column names (obj1_filename, not obj1_file)
    obj1_filename: str | None
    obj2_filename: str | None

    @classmethod
    def csv_columns(cls) -> list[str]:
        """The exact CSV column order matching the TraCSS answer key (45 columns)."""
        return [
            "run_id", "conj_id", "obj1", "met_criteria1", "obj2", "met_criteria2",
            "min_range", "Vrel", "prob", "dilution", "mdistance", "epoch", "jdate",
            "x1", "y1", "z1", "vx1", "vy1", "vz1",
            "local_x1", "local_y1", "local_z1",
            "c1_11", "c1_12", "c1_13", "c1_22", "c1_23", "c1_33",
            "x2", "y2", "z2", "vx2", "vy2", "vz2",
            "local_x2", "local_y2", "local_z2",
            "c2_11", "c2_12", "c2_13", "c2_22", "c2_23", "c2_33",
            "obj1_filename", "obj2_filename",
        ]


class CandidatePair(BaseModel):
    """A pair of objects that passed spatial screening; needs Pc computation."""

    obj1_id: int
    obj2_id: int
    approx_min_range_km: float
    approx_tca: datetime
