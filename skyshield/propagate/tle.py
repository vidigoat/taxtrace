"""TLE (Two-Line Element) parser.

Standard NORAD TLE format:
    Line 1: 1 SSSSS CSSSSSAA IIDDDDDDDDDDD ±MMMMM±MMMMM ±MMMMM- M EEEEE C
    Line 2: 2 SSSSS III.IIII NNN.NNNN EEEEEEE WWW.WWWW MMM.MMMM RR.RRRRRRRR

Reference: https://celestrak.org/NORAD/documentation/tle-fmt.php

We deliberately re-implement the parser (rather than depend on `sgp4` package)
so we can hand the elements straight into our JAX SGP4 implementation without
adapter friction.
"""

from __future__ import annotations

import math
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class TLE:
    """Parsed two-line element set.

    All angles are stored in radians, mean motion in rad/min as used by SGP4
    internally. This avoids unit conversions in the propagator.
    """

    name: str
    catalog_number: int          # NORAD ID
    classification: str          # U / C / S
    intl_designator: str         # e.g. "98067A"
    epoch_year: int              # 4-digit year
    epoch_day: float             # day-of-year + fraction
    mean_motion_dot: float       # rev/day/day (1st derivative)
    mean_motion_ddot: float      # rev/day^3  (2nd derivative)
    bstar: float                 # drag term (1/earth_radii)
    element_set_number: int
    inclination: float           # rad
    raan: float                  # rad
    eccentricity: float          # 0..1
    arg_perigee: float           # rad
    mean_anomaly: float          # rad
    mean_motion: float           # rad/min
    rev_at_epoch: int

    @property
    def epoch_jd(self) -> float:
        """Julian date of epoch."""
        year = self.epoch_year
        if year < 57:
            year += 2000
        elif year < 100:
            year += 1900
        # Jan 0 of `year` in JD (i.e., midnight start of Dec 31 prior year)
        y = year - 1
        a = y // 100
        b = 2 - a + (a // 4)
        jd_jan0 = math.floor(365.25 * y) + math.floor(30.6001 * 14) + 1720994.5 + b
        return jd_jan0 + self.epoch_day


def _parse_exp_field(field: str) -> float:
    """Parse a TLE-format implied-decimal exponential field, e.g. '-12345-3' => -1.2345e-4."""
    f = field.strip()
    if not f or f.replace("-", "").replace("+", "").replace(".", "").replace("0", "") == "":
        return 0.0
    sign = 1.0
    if f.startswith("-"):
        sign = -1.0
        f = f[1:]
    elif f.startswith("+"):
        f = f[1:]
    # Split at the last + or - for the exponent
    exp_sign = 1
    exp_idx = None
    for i in range(len(f) - 1, 0, -1):
        if f[i] in "+-":
            exp_sign = -1 if f[i] == "-" else 1
            exp_idx = i
            break
    if exp_idx is None:
        mantissa = float("0." + f.lstrip("0") if not f.startswith(".") else f)
        return sign * mantissa
    mantissa_str = f[:exp_idx]
    exp_str = f[exp_idx + 1:]
    mantissa = float("0." + mantissa_str)
    exponent = exp_sign * int(exp_str)
    return sign * mantissa * 10 ** exponent


def _checksum(line: str) -> int:
    """Compute the standard TLE modulo-10 checksum (digits + minus signs as 1)."""
    s = 0
    for c in line[:-1]:
        if c.isdigit():
            s += int(c)
        elif c == "-":
            s += 1
    return s % 10


def parse_tle_text(text: str, *, name: str | None = None) -> TLE:
    """Parse a TLE from a 2- or 3-line block of text.

    Accepts both bare two-line and three-line (with name) input.
    """
    lines = [ln.rstrip() for ln in text.strip().splitlines() if ln.strip()]
    if len(lines) == 3:
        nm = lines[0].strip()
        l1, l2 = lines[1], lines[2]
    elif len(lines) == 2:
        nm = name or ""
        l1, l2 = lines[0], lines[1]
    else:
        raise ValueError(f"TLE must be 2 or 3 lines, got {len(lines)}")

    if not l1.startswith("1 ") or not l2.startswith("2 "):
        raise ValueError("Invalid TLE format: lines must start with '1 ' and '2 '")

    if len(l1) < 68 or len(l2) < 68:
        raise ValueError(f"TLE lines must be at least 68 chars, got {len(l1)} and {len(l2)}")

    # Line 1
    catnum = int(l1[2:7])
    classification = l1[7]
    intl_des = l1[9:17].strip()
    epoch_year = int(l1[18:20])
    epoch_day = float(l1[20:32])
    mm_dot = float(l1[33:43])
    mm_ddot = _parse_exp_field(l1[44:52])
    bstar = _parse_exp_field(l1[53:61])
    element_set = int(l1[64:68])

    # Line 2
    inc_deg = float(l2[8:16])
    raan_deg = float(l2[17:25])
    ecc = float("0." + l2[26:33].strip())
    argp_deg = float(l2[34:42])
    mean_anom_deg = float(l2[43:51])
    mean_motion_rev_per_day = float(l2[52:63])
    rev_at_epoch = int(l2[63:68])

    deg2rad = math.pi / 180.0
    return TLE(
        name=nm,
        catalog_number=catnum,
        classification=classification,
        intl_designator=intl_des,
        epoch_year=epoch_year,
        epoch_day=epoch_day,
        mean_motion_dot=mm_dot,
        mean_motion_ddot=mm_ddot,
        bstar=bstar,
        element_set_number=element_set,
        inclination=inc_deg * deg2rad,
        raan=raan_deg * deg2rad,
        eccentricity=ecc,
        arg_perigee=argp_deg * deg2rad,
        mean_anomaly=mean_anom_deg * deg2rad,
        mean_motion=mean_motion_rev_per_day * 2.0 * math.pi / 1440.0,
        rev_at_epoch=rev_at_epoch,
    )


def parse_tle_file(path: str | Path) -> list[TLE]:
    """Parse a file containing one or many TLEs (Celestrak-format catalog)."""
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    return list(_iter_tles(text))


def _iter_tles(text: str) -> Iterator[TLE]:
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    i = 0
    while i < len(lines):
        # 3-line block: name + L1 + L2
        if (i + 2) < len(lines) and lines[i + 1].startswith("1 ") and lines[i + 2].startswith("2 "):
            yield parse_tle_text("\n".join(lines[i:i + 3]))
            i += 3
        # 2-line block
        elif (i + 1) < len(lines) and lines[i].startswith("1 ") and lines[i + 1].startswith("2 "):
            yield parse_tle_text("\n".join(lines[i:i + 2]))
            i += 2
        else:
            i += 1
