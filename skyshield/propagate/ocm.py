"""OCM (Orbit Comprehensive Message) parser.

The TraCSS Aerospace IVV dataset uses OCM-formatted ephemerides per CCSDS 504.0-B-1
(NDM/OCM specification). We support the KVN (Key=Value Notation) form which is
human-readable plain text.

Spec: https://space.commerce.gov/wp-content/uploads/2025/07/TraCSS-OCM-Spec-2_Public.pdf

The OCM structure (per CCSDS) is:
    CCSDS_OCM_VERS    = X.X
    HEADER segment
    METADATA segment
    DATA segments (orbital data, physical data, covariance, maneuver, ...)

Each data segment is delimited by `META_START`/`META_STOP`, `ORB_START`/`ORB_STOP`,
`COV_START`/`COV_STOP` etc. We parse what we need for conjunction screening:
    - OBJECT_DESIGNATOR (catalog ID)
    - OD_EPOCH (orbit determination epoch)
    - Use of START/USEABLE_START_TIME / USEABLE_STOP_TIME
    - Orbital state vectors (epoch, position, velocity)
    - Position/velocity covariance (in UVW frame)

We are tolerant of fields we don't recognize — they're stored in `extras` for the
user but ignored for screening.
"""

from __future__ import annotations

import contextlib
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import numpy as np

_TIME_FORMATS = [
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%jT%H:%M:%S.%f",
    "%Y-%jT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S.%f",
    "%Y-%m-%d %H:%M:%S",
]


def parse_ocm_epoch(s: str) -> datetime:
    """Parse a CCSDS time string in any of the standard formats."""
    s = s.strip().rstrip("Z")
    for fmt in _TIME_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse CCSDS time: {s!r}")


@dataclass
class OCMOrbitState:
    """A single orbital state from an ORB data segment."""

    epoch: datetime
    # Position (km) and velocity (km/s) in the segment's REF_FRAME (default J2000 / EME2000)
    x: float
    y: float
    z: float
    vx: float
    vy: float
    vz: float

    def as_array(self) -> np.ndarray:
        return np.array([self.x, self.y, self.z, self.vx, self.vy, self.vz], dtype=np.float64)


@dataclass
class OCMCovariance:
    """Covariance matrix at a given epoch. Either 3x3 (CARTP, position-only)
    or 6x6 (CARTPV, position + velocity).

    Stored as the lower-triangular matrix (LTM) — matches the CCSDS COV_ORDERING
    convention used by the Aerospace IVV dataset. Order for 3x3:
        c11, c21, c22, c31, c32, c33
    Order for 6x6:
        c11, c21, c22, c31, c32, c33, ..., c66
    """

    epoch: datetime
    elements: list[float] = field(default_factory=list)
    frame: str = "UVW"

    @property
    def dim(self) -> int:
        """Dimension of the matrix (3 for CARTP, 6 for CARTPV)."""
        n = len(self.elements)
        if n == 6:
            return 3
        if n == 21:
            return 6
        # Fall back: solve k(k+1)/2 = n
        for k in (1, 2, 3, 4, 5, 6, 7, 8, 9):
            if k * (k + 1) // 2 == n:
                return k
        return 0

    def as_matrix(self) -> np.ndarray:
        """Return the full symmetric matrix at the OCM's native dimension."""
        d = self.dim
        if d == 0:
            return np.zeros((6, 6), dtype=np.float64)
        m = np.zeros((d, d), dtype=np.float64)
        idx = 0
        for i in range(d):
            for j in range(i + 1):
                if idx < len(self.elements):
                    m[i, j] = self.elements[idx]
                    m[j, i] = self.elements[idx]
                    idx += 1
        return m

    def as_3x3_position(self) -> np.ndarray:
        """Return just the 3x3 position-position covariance block (always 3x3)."""
        m = self.as_matrix()
        if m.shape[0] >= 3:
            return m[:3, :3]
        return np.zeros((3, 3), dtype=np.float64)


@dataclass
class OCM:
    """A parsed CCSDS Orbit Comprehensive Message.

    Attributes
    ----------
    object_designator : str
        Catalog ID. Per TraCSS User Guide §3.1 this maps to Sat ID:
        00005-62461 = TLE-derived; 90006-90190 = synthetic maneuvers;
        95000-95407 = historical CDMs; 99000+ = fictitious.
    object_name : str
        Human-readable name if provided.
    ref_frame : str
        Reference frame for state vectors (default J2000 / EME2000).
    time_system : str
        Time scale (default UTC).
    od_epoch : datetime | None
        Orbit determination epoch. Per TraCSS §4.4, ephemerides where this is
        > 14 days from screening window start must be filtered out.
    useable_start : datetime | None
        Earliest valid time for the orbit data.
    useable_stop : datetime | None
        Latest valid time for the orbit data.
    states : list[OCMOrbitState]
        Time-ordered state vectors.
    covariances : list[OCMCovariance]
        Time-ordered covariance matrices (may be empty or shorter than `states`).
    extras : dict[str, str]
        Other fields parsed from the message but not used for screening.
    source_file : str | None
        Path to the source file for traceability (matches `obj1_file`/`obj2_file`
        columns in the answer key CSV).
    """

    object_designator: str
    object_name: str = ""
    ref_frame: str = "EME2000"
    time_system: str = "UTC"
    od_epoch: datetime | None = None
    useable_start: datetime | None = None
    useable_stop: datetime | None = None
    states: list[OCMOrbitState] = field(default_factory=list)
    covariances: list[OCMCovariance] = field(default_factory=list)
    extras: dict[str, str] = field(default_factory=dict)
    source_file: str | None = None

    @property
    def sat_id(self) -> int:
        """Integer Sat ID per TraCSS conventions.

        Falls back to a hash of the designator if it isn't numeric.
        """
        try:
            return int(self.object_designator)
        except ValueError:
            return abs(hash(self.object_designator)) % 100000

    def epoch_array(self) -> np.ndarray:
        return np.array([s.epoch.timestamp() for s in self.states], dtype=np.float64)

    def state_matrix(self) -> np.ndarray:
        """Return a (N, 6) array of [x, y, z, vx, vy, vz] in the OCM's reference frame."""
        if not self.states:
            return np.empty((0, 6), dtype=np.float64)
        return np.array([s.as_array() for s in self.states], dtype=np.float64)

    def od_age_days(self, screening_window_start: datetime) -> float:
        """Age of the OD epoch in days before the screening window start.

        Per TraCSS §4.4, this must be < 14 for the ephemeris to be valid.
        Returns +inf if OD_EPOCH not present.
        """
        if self.od_epoch is None:
            return float("inf")
        return (screening_window_start - self.od_epoch).total_seconds() / 86400.0


# ---- KVN parser ----

_KVN_RE = re.compile(r"^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*(?:#.*)?$")
_COMMENT_RE = re.compile(r"^\s*COMMENT\b", re.IGNORECASE)


def _parse_kvn_line(line: str) -> tuple[str, str] | None:
    """Parse a single KVN line into (key, value), or None if not a KVN line."""
    if _COMMENT_RE.match(line):
        return None
    m = _KVN_RE.match(line)
    if not m:
        return None
    return m.group(1).upper(), m.group(2).strip()


def parse_ocm_text(text: str, *, source_file: str | None = None) -> OCM:
    """Parse OCM-formatted text in KVN style (CCSDS 502.0-B-3).

    Sections recognized: META, TRAJ (orbital data), PHYS, COV, PERT, OD.
    Data rows in TRAJ and COV are: <ISO-datetime> <floats...>.
    Tolerant of unknown fields (stored in `extras`).
    """
    ocm = OCM(object_designator="UNKNOWN", source_file=source_file)
    state: str = "META"  # META | TRAJ | COV | PHYS | PERT | OD
    current_cov_epoch: datetime | None = None
    current_cov_elements: list[float] = []

    # Section delimiters present in CCSDS OCM 502.0-B-3
    section_starts = {
        "META_START": "META", "META_BLOCK_START": "META",
        "TRAJ_START": "TRAJ", "ORB_START": "TRAJ", "ORB_BLOCK_START": "TRAJ",
        "COV_START": "COV", "COV_BLOCK_START": "COV",
        "PHYS_START": "PHYS",
        "PERT_START": "PERT",
        "OD_START": "OD",
    }
    section_stops = {
        "META_STOP", "META_BLOCK_END",
        "TRAJ_STOP", "ORB_STOP", "ORB_BLOCK_END",
        "COV_STOP", "COV_BLOCK_END",
        "PHYS_STOP",
        "PERT_STOP",
        "OD_STOP",
    }

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        # Section delimiters
        if line in section_starts:
            # Flush a pending covariance row before transitioning
            if (
                state == "COV"
                and current_cov_epoch is not None
                and current_cov_elements
            ):
                ocm.covariances.append(
                    OCMCovariance(
                        epoch=current_cov_epoch,
                        elements=current_cov_elements,
                        frame=ocm.extras.get("COV_REF_FRAME", "UVW"),
                    )
                )
                current_cov_epoch = None
                current_cov_elements = []
            state = section_starts[line]
            continue
        if line in section_stops:
            if (
                state == "COV"
                and current_cov_epoch is not None
                and current_cov_elements
            ):
                ocm.covariances.append(
                    OCMCovariance(
                        epoch=current_cov_epoch,
                        elements=current_cov_elements,
                        frame=ocm.extras.get("COV_REF_FRAME", "UVW"),
                    )
                )
                current_cov_epoch = None
                current_cov_elements = []
            state = "META"
            continue

        kv = _parse_kvn_line(line)
        if kv is not None:
            key, value = kv
            _apply_keyvalue(ocm, key, value)
            continue

        # Data rows in TRAJ or COV sections
        if state == "TRAJ":
            _try_parse_orb_row(ocm, line)
        elif state == "COV":
            # Each row in COV starts with an epoch and is self-contained:
            # for CARTP+LTM, 6 floats (3x3 position cov, lower triangle)
            # for CARTPV+LTM, 21 floats (6x6 pos-vel cov, lower triangle)
            parts = line.split()
            if len(parts) >= 2:
                try:
                    epoch = parse_ocm_epoch(parts[0])
                    elements = [float(p) for p in parts[1:]]
                    if elements:
                        ocm.covariances.append(
                            OCMCovariance(
                                epoch=epoch,
                                elements=elements,
                                frame=ocm.extras.get("COV_REF_FRAME", "UVW"),
                            )
                        )
                except ValueError:
                    # not a data row (could be section header)
                    pass

    return ocm


def _apply_keyvalue(ocm: OCM, key: str, value: str) -> None:
    """Apply a KVN field to the OCM being built (CCSDS 502.0-B-3 names)."""
    if key in ("OBJECT_DESIGNATOR", "OBJECT_ID"):
        ocm.object_designator = value
    elif key == "OBJECT_NAME":
        ocm.object_name = value
    elif key in ("REF_FRAME", "TRAJ_REF_FRAME"):
        ocm.ref_frame = value
    elif key == "TIME_SYSTEM":
        ocm.time_system = value
    elif key == "OD_EPOCH":
        try:
            ocm.od_epoch = parse_ocm_epoch(value)
        except ValueError:
            ocm.extras[key] = value
    elif key in ("USEABLE_START_TIME", "USABLE_START_TIME"):
        try:
            ocm.useable_start = parse_ocm_epoch(value)
        except ValueError:
            ocm.extras[key] = value
    elif key in ("USEABLE_STOP_TIME", "USABLE_STOP_TIME"):
        try:
            ocm.useable_stop = parse_ocm_epoch(value)
        except ValueError:
            ocm.extras[key] = value
    else:
        # Includes EPOCH_TZERO, COV_REF_FRAME, COV_TYPE, COV_ORDERING, etc.
        ocm.extras[key] = value


def _try_parse_orb_row(ocm: OCM, line: str) -> None:
    """Parse a single ORB-segment data row of the form:
        EPOCH X Y Z VX VY VZ
    where EPOCH is an ISO time and positions are in km, velocities in km/s.
    """
    parts = line.split()
    if len(parts) < 7:
        return
    try:
        epoch = parse_ocm_epoch(parts[0])
        x, y, z, vx, vy, vz = (float(p) for p in parts[1:7])
    except ValueError:
        return
    ocm.states.append(OCMOrbitState(epoch=epoch, x=x, y=y, z=z, vx=vx, vy=vy, vz=vz))


def _try_parse_cov_row(
    line: str,
    current_epoch: datetime | None,
    current_elements: list[float],
) -> tuple[datetime | None, list[float]]:
    """Parse a COV-segment data row.

    Two formats supported:
      1) EPOCH followed by 21 floats on subsequent lines (sequential elements)
      2) Single line: EPOCH e1 e2 ... e21
    """
    parts = line.split()
    if not parts:
        return current_epoch, current_elements

    # Try first token as epoch
    try:
        first_epoch = parse_ocm_epoch(parts[0])
        # If epoch parses, the rest are covariance values
        for tok in parts[1:]:
            with contextlib.suppress(ValueError):
                current_elements.append(float(tok))
        return first_epoch, current_elements
    except ValueError:
        # All tokens are floats continuing previous row
        for tok in parts:
            with contextlib.suppress(ValueError):
                current_elements.append(float(tok))
        return current_epoch, current_elements


def parse_ocm_file(path: str | Path) -> OCM:
    """Read and parse an OCM file from disk."""
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    return parse_ocm_text(text, source_file=str(p))


def parse_ocm_directory(path: str | Path, *, pattern: str = "*.ocm") -> list[OCM]:
    """Parse all OCM files in a directory tree."""
    p = Path(path)
    out: list[OCM] = []
    for f in p.rglob(pattern):
        if f.is_file():
            try:
                out.append(parse_ocm_file(f))
            except Exception:
                # Skip malformed files; surface count via len() to caller
                continue
    return out
