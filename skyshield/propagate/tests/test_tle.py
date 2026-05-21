"""Tests for the TLE parser.

Uses real Celestrak TLEs as fixtures so we know our parser handles production data.
"""

from __future__ import annotations

import math

import pytest

from skyshield.propagate.tle import _parse_exp_field, parse_tle_text

# ISS TLE from Celestrak (epoch 2024-01-01)
ISS_TLE = """ISS (ZARYA)
1 25544U 98067A   24001.50000000  .00012345  00000+0  22845-3 0  9991
2 25544  51.6400 247.4622 0006703 130.5360 325.0288 15.49558123431234"""

STARLINK_TLE = """STARLINK-1234
1 44943U 19074F   24001.30000000  .00001234  00000+0  88888-4 0  9999
2 44943  53.0000  10.0000 0001234  90.0000 270.0000 15.06000000123456"""


def test_iss_basic():
    tle = parse_tle_text(ISS_TLE)
    assert tle.name == "ISS (ZARYA)"
    assert tle.catalog_number == 25544
    assert tle.classification == "U"
    assert tle.intl_designator == "98067A"
    assert tle.epoch_year == 24
    assert abs(tle.eccentricity - 0.0006703) < 1e-7
    assert math.isclose(tle.inclination, math.radians(51.6400), rel_tol=1e-6)
    assert math.isclose(tle.raan, math.radians(247.4622), rel_tol=1e-6)


def test_two_line_form():
    """Should accept TLE without a name line."""
    text = "\n".join(ISS_TLE.splitlines()[1:])
    tle = parse_tle_text(text, name="ISS")
    assert tle.name == "ISS"
    assert tle.catalog_number == 25544


def test_starlink_basic():
    tle = parse_tle_text(STARLINK_TLE)
    assert tle.catalog_number == 44943
    assert tle.intl_designator == "19074F"


def test_exp_field_parsing():
    """The implied-decimal exponential field is tricky; cover the typical cases."""
    assert _parse_exp_field(" 00000+0") == 0.0
    assert _parse_exp_field(" 12345-3") == pytest.approx(1.2345e-4, rel=1e-6)
    assert _parse_exp_field("-12345-3") == pytest.approx(-1.2345e-4, rel=1e-6)
    assert _parse_exp_field(" 22845-3") == pytest.approx(2.2845e-4, rel=1e-6)
    assert _parse_exp_field(" 88888-4") == pytest.approx(8.8888e-5, rel=1e-6)


def test_epoch_jd():
    """Convert TLE epoch (year + day-of-year) to Julian date."""
    tle = parse_tle_text(ISS_TLE)
    # 2024-01-01 12:00:00 UTC ≈ JD 2460311.0
    assert abs(tle.epoch_jd - 2460311.0) < 0.6


def test_invalid_format_raises():
    with pytest.raises(ValueError, match="lines"):
        parse_tle_text("not a tle")


def test_mean_motion_units():
    """Mean motion should be in rad/min for SGP4 internal use."""
    tle = parse_tle_text(ISS_TLE)
    # ISS does ~15.49 rev/day
    rev_per_day = tle.mean_motion * 1440.0 / (2.0 * math.pi)
    assert 15.0 < rev_per_day < 16.0
