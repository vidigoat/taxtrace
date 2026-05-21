"""Physical and astronomical constants used throughout SkyShield AI.

All units are SI unless otherwise specified. Length is in km for orbital mechanics
(conventional in the field), time in seconds.
"""

from __future__ import annotations

# Earth gravitational parameter (km^3 / s^2) — WGS-84
MU_EARTH = 398600.4418

# Earth equatorial radius (km) — WGS-84
R_EARTH = 6378.137

# Earth flattening — WGS-84
F_EARTH = 1.0 / 298.257223563

# J2 zonal harmonic — WGS-84
J2 = 1.082626683e-3

# Seconds per day
SECONDS_PER_DAY = 86400.0

# Julian date of J2000 epoch (2000-01-01T12:00:00 TT)
JD_J2000 = 2451545.0

# Astronomical unit (km)
AU_KM = 149597870.700

# Default hard-body radius for spherical screening (meters)
# Per TraCSS User Guide section 5.1.a
DEFAULT_HBR_M = 0.5

# Spherical screening volume per TraCSS (km)
SPHERICAL_SCREEN_KM = 10.0

# Pi
PI = 3.141592653589793

# Two-pi
TWOPI = 2.0 * PI

# Degrees to radians
DEG2RAD = PI / 180.0
RAD2DEG = 180.0 / PI

# Earth rotation rate (rad/s)
OMEGA_EARTH = 7.2921150e-5

# TraCSS screening window (per User Guide Section 4)
TRACSS_WINDOW_START = "2025-01-01T12:00:00Z"
TRACSS_WINDOW_END = "2025-01-08T12:00:00Z"

# OD epoch max age (days) — filter per User Guide §4.4
OD_EPOCH_MAX_AGE_DAYS = 14
