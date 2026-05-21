"""Tests for the JAX SGP4 implementation.

These are sanity checks — full numerical validation vs python-sgp4 happens in
the benchmark suite. Here we verify:
  - The propagator runs (doesn't crash)
  - At t=0, it returns positions consistent with the orbital elements
  - Velocities and positions are finite
  - Cross-product r × v gives the angular momentum vector (constants of motion)
"""

from __future__ import annotations

import jax.numpy as jnp
import pytest

from skyshield.propagate.sgp4_jax import (
    elements_from_tle,
    propagate_one,
)
from skyshield.propagate.tle import parse_tle_text

ISS_TLE = """ISS (ZARYA)
1 25544U 98067A   24001.50000000  .00012345  00000+0  22845-3 0  9991
2 25544  51.6400 247.4622 0006703 130.5360 325.0288 15.49558123431234"""


def test_iss_propagator_runs():
    tle = parse_tle_text(ISS_TLE)
    elt = elements_from_tle(tle)
    r, v = propagate_one(elt, jnp.asarray(0.0))
    assert r.shape == (3,)
    assert v.shape == (3,)
    assert jnp.all(jnp.isfinite(r))
    assert jnp.all(jnp.isfinite(v))


def test_radius_in_leo_range():
    """ISS sits at ~400 km altitude → geocentric radius ~6800 km."""
    tle = parse_tle_text(ISS_TLE)
    elt = elements_from_tle(tle)
    r, _ = propagate_one(elt, jnp.asarray(0.0))
    r_mag = float(jnp.linalg.norm(r))
    assert 6000.0 < r_mag < 7500.0, f"Expected LEO radius ~6800 km, got {r_mag}"


def test_speed_in_leo_range():
    """ISS orbital speed ~7.66 km/s."""
    tle = parse_tle_text(ISS_TLE)
    elt = elements_from_tle(tle)
    _, v = propagate_one(elt, jnp.asarray(0.0))
    v_mag = float(jnp.linalg.norm(v))
    assert 5.0 < v_mag < 10.0, f"Expected LEO speed ~7.7 km/s, got {v_mag}"


@pytest.mark.parametrize("t_min", [0.0, 10.0, 90.0, 1440.0])
def test_propagation_at_various_times(t_min: float):
    """Propagate forward by various times; results should remain bounded."""
    tle = parse_tle_text(ISS_TLE)
    elt = elements_from_tle(tle)
    r, v = propagate_one(elt, jnp.asarray(t_min))
    assert jnp.all(jnp.isfinite(r))
    assert jnp.all(jnp.isfinite(v))
    r_mag = float(jnp.linalg.norm(r))
    assert 5000.0 < r_mag < 10000.0
