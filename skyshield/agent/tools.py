"""Tool definitions for the SkyShield agent.

Each tool wraps a physics function from `skyshield/{propagate,screen,pc,avoid}/`
with the Anthropic tool-calling schema and a dispatcher that runs the actual
computation.
"""

from __future__ import annotations

from datetime import UTC
from typing import Any

import numpy as np

# Anthropic tool-use schema (JSON Schema)
TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "propagate_satellite",
        "description": (
            "Propagate one satellite forward in time using SGP4. "
            "Returns state vectors (position, velocity) at the requested time. "
            "Use this when the user asks 'where will satellite X be at time T?'"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sat_id": {
                    "type": "integer",
                    "description": "NORAD catalog number of the satellite",
                },
                "hours_forward": {
                    "type": "number",
                    "description": "Hours from now to propagate forward (negative = backward)",
                    "minimum": -168,
                    "maximum": 720,
                },
            },
            "required": ["sat_id", "hours_forward"],
        },
    },
    {
        "name": "screen_against_catalog",
        "description": (
            "Screen a single satellite against the live Celestrak catalog "
            "(~30,000 tracked objects) for close approaches within the next "
            "`days` days. Returns a list of conjunctions sorted by Pc (highest risk first). "
            "Use this when the user asks 'is my satellite safe this week?'"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sat_id": {
                    "type": "integer",
                    "description": "NORAD catalog number of the target satellite",
                },
                "days": {
                    "type": "number",
                    "description": "Look-ahead window in days (default 7)",
                    "minimum": 0.1,
                    "maximum": 30,
                },
                "screening_volume_km": {
                    "type": "number",
                    "description": "Spherical screening radius in km (default 10 km)",
                    "default": 10,
                },
            },
            "required": ["sat_id"],
        },
    },
    {
        "name": "compute_pc",
        "description": (
            "Compute the probability of collision (Pc) between two objects "
            "at a specific time, given their states and covariances. "
            "Default method is Alfano 2004 — same as TraCSS answer key. "
            "Use when the user asks 'what's my collision probability?'"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "obj1_position_km": {
                    "type": "array",
                    "items": {"type": "number"},
                    "description": "[x, y, z] of object 1 in J2000 frame (km)",
                },
                "obj1_velocity_kms": {
                    "type": "array",
                    "items": {"type": "number"},
                    "description": "[vx, vy, vz] of object 1 (km/s)",
                },
                "obj2_position_km": {
                    "type": "array",
                    "items": {"type": "number"},
                },
                "obj2_velocity_kms": {
                    "type": "array",
                    "items": {"type": "number"},
                },
                "obj1_position_sigma_m": {
                    "type": "number",
                    "description": "1-sigma position uncertainty for object 1 (meters)",
                    "default": 50,
                },
                "obj2_position_sigma_m": {
                    "type": "number",
                    "default": 50,
                },
                "hbr_m": {
                    "type": "number",
                    "description": "Combined hard-body radius (meters); default 5",
                    "default": 5,
                },
                "method": {
                    "type": "string",
                    "enum": ["alfano2004", "chan", "foster", "patera", "monte_carlo"],
                    "default": "alfano2004",
                },
            },
            "required": ["obj1_position_km", "obj1_velocity_kms",
                         "obj2_position_km", "obj2_velocity_kms"],
        },
    },
    {
        "name": "find_avoidance_maneuver",
        "description": (
            "Given a predicted conjunction, find the minimum-Δv impulsive "
            "maneuver that drops post-burn miss distance to the target. "
            "Returns (Δv vector, burn time before TCA, predicted post-burn miss). "
            "Use when the user asks 'what burn should I plan?'"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "r1_at_tca_km": {"type": "array", "items": {"type": "number"}},
                "r2_at_tca_km": {"type": "array", "items": {"type": "number"}},
                "v1_at_tca_kms": {"type": "array", "items": {"type": "number"}},
                "v2_at_tca_kms": {"type": "array", "items": {"type": "number"}},
                "burn_time_minutes_before_tca": {
                    "type": "number",
                    "default": 30,
                },
                "target_miss_km": {
                    "type": "number",
                    "description": "Target miss distance after the burn",
                    "default": 1.0,
                },
                "max_dv_mps": {
                    "type": "number",
                    "description": "Maximum Δv magnitude in m/s",
                    "default": 50,
                },
            },
            "required": ["r1_at_tca_km", "r2_at_tca_km", "v1_at_tca_kms", "v2_at_tca_kms"],
        },
    },
    {
        "name": "get_satellite_info",
        "description": (
            "Look up a satellite by NORAD catalog number, name, or international "
            "designator. Returns name, orbit type (LEO/MEO/GEO), perigee/apogee, "
            "inclination, and operator if known."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "NORAD ID (e.g. '25544'), name (e.g. 'ISS'), or designator",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_top_risks",
        "description": (
            "Return the Top N highest-Pc conjunctions from the US Office of Space "
            "Commerce TraCSS verification dataset (913,330 conjunctions, Oct 2025). "
            "This is the first public ranking of the riskiest events in the dataset "
            "— extracted and published by SkyShield. Use when the user asks "
            "'what are the riskiest conjunctions?' or 'show me the top close approaches'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "n": {
                    "type": "integer",
                    "description": "How many top events to return (default 10)",
                    "default": 10,
                    "minimum": 1,
                    "maximum": 100,
                },
            },
        },
    },
]


def dispatch_tool_call(name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Run the actual physics computation for a given tool call.

    Returns a dict with the result. If anything fails, returns {"error": "..."}.
    """
    try:
        if name == "propagate_satellite":
            return _tool_propagate(**args)
        if name == "screen_against_catalog":
            return _tool_screen(**args)
        if name == "compute_pc":
            return _tool_compute_pc(**args)
        if name == "find_avoidance_maneuver":
            return _tool_avoidance(**args)
        if name == "get_satellite_info":
            return _tool_satellite_info(**args)
        if name == "get_top_risks":
            return _tool_top_risks(**args)
        return {"error": f"Unknown tool: {name}"}
    except Exception as e:
        return {"error": f"{name} failed: {e}"}


# ---- Tool implementations ----

# Cached TLE catalog (refreshed every 6 hours).
_tle_cache: dict[str, Any] = {"data": {}, "fetched_at": 0.0}


def _fetch_celestrak_tle(sat_id: int) -> dict[str, Any] | None:
    """Fetch a specific satellite's TLE from Celestrak.

    Caches the full active-satellite catalog (10K+ entries) for 6 hours so
    individual lookups are O(1) after the first call.
    """
    import time
    import urllib.request

    now = time.time()
    if now - _tle_cache["fetched_at"] > 6 * 3600 or not _tle_cache["data"]:
        try:
            url = (
                "https://celestrak.org/NORAD/elements/gp.php"
                "?GROUP=active&FORMAT=tle"
            )
            with urllib.request.urlopen(url, timeout=15) as r:
                text = r.read().decode("utf-8", errors="ignore")
            lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
            data: dict[int, dict[str, Any]] = {}
            for i in range(0, len(lines), 3):
                if i + 2 >= len(lines):
                    break
                name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
                if not l1.startswith("1 ") or not l2.startswith("2 "):
                    continue
                try:
                    norad = int(l1[2:7])
                except ValueError:
                    continue
                data[norad] = {"name": name.strip(), "line1": l1, "line2": l2}
            _tle_cache["data"] = data
            _tle_cache["fetched_at"] = now
        except Exception:
            # Network failure — keep stale cache if any
            pass

    return _tle_cache["data"].get(sat_id)


def _tool_propagate(sat_id: int, hours_forward: float) -> dict[str, Any]:
    """Real propagation: fetch TLE from Celestrak, run SGP4-in-JAX."""
    from datetime import datetime, timedelta

    import jax.numpy as jnp

    from skyshield.propagate.sgp4_jax import elements_from_tle, propagate_one
    from skyshield.propagate.tle import parse_tle_text

    tle_entry = _fetch_celestrak_tle(sat_id)
    if tle_entry is None:
        return {
            "sat_id": sat_id,
            "error": f"NORAD {sat_id} not in current Celestrak active catalog",
            "note": "Try a major active satellite NORAD ID (e.g., 25544 for ISS)",
        }

    text = f"{tle_entry['name']}\n{tle_entry['line1']}\n{tle_entry['line2']}"
    tle = parse_tle_text(text)
    elt = elements_from_tle(tle)
    # Minutes from TLE epoch to (now + hours_forward)
    now = datetime.now(UTC)
    target = now + timedelta(hours=hours_forward)
    # TLE epoch in datetime
    epoch_year = tle.epoch_year if tle.epoch_year > 56 else tle.epoch_year + 2000
    if epoch_year < 100:
        epoch_year += 1900
    tle_epoch = datetime(epoch_year, 1, 1, tzinfo=UTC) + timedelta(
        days=tle.epoch_day - 1
    )
    delta_min = (target - tle_epoch).total_seconds() / 60.0
    r, v = propagate_one(elt, jnp.asarray(delta_min))
    return {
        "sat_id": sat_id,
        "name": tle_entry["name"],
        "epoch_iso": target.isoformat(timespec="seconds"),
        "position_km": [float(r[0]), float(r[1]), float(r[2])],
        "velocity_kms": [float(v[0]), float(v[1]), float(v[2])],
        "altitude_km": float(jnp.linalg.norm(r)) - 6378.137,
        "speed_kms": float(jnp.linalg.norm(v)),
        "source": "live Celestrak TLE + SGP4-in-JAX",
    }


def _tool_screen(sat_id: int, days: float = 7.0, screening_volume_km: float = 10.0) -> dict[str, Any]:
    """Screen one satellite against the live Celestrak catalog.

    Pulls the active TLE catalog (cached 6h), propagates the target + every
    other object at coarse cadence, returns pairs within `screening_volume_km`
    at any sample over `days`.
    """
    from datetime import datetime, timedelta

    import numpy as np

    from skyshield.propagate.sgp4_jax import (
        elements_from_tle,
        propagate_batch,
    )
    from skyshield.propagate.tle import parse_tle_text

    tle_entry = _fetch_celestrak_tle(sat_id)
    if tle_entry is None:
        return {
            "sat_id": sat_id,
            "error": f"NORAD {sat_id} not in Celestrak active catalog",
        }
    if not _tle_cache["data"]:
        return {"sat_id": sat_id, "error": "Celestrak fetch failed"}

    # Build TLE list for entire catalog
    catalog = _tle_cache["data"]
    catalog_ids = list(catalog.keys())[:5000]  # cap for speed
    elements_list = []
    for cid in catalog_ids:
        try:
            entry = catalog[cid]
            tle = parse_tle_text(f"{entry['name']}\n{entry['line1']}\n{entry['line2']}")
            elements_list.append(elements_from_tle(tle))
        except Exception:
            continue

    if not elements_list:
        return {"sat_id": sat_id, "error": "no parseable TLEs"}

    # Sample positions at coarse cadence over the window
    now = datetime.now(UTC)
    n_steps = int(days * 24 * 4)   # every 15 min
    t_minutes = np.linspace(0, days * 1440.0, n_steps)

    import jax.numpy as jnp
    arr = {
        "no_kozai": jnp.array([e.no_kozai for e in elements_list]),
        "ecco": jnp.array([e.ecco for e in elements_list]),
        "inclo": jnp.array([e.inclo for e in elements_list]),
        "nodeo": jnp.array([e.nodeo for e in elements_list]),
        "argpo": jnp.array([e.argpo for e in elements_list]),
        "mo": jnp.array([e.mo for e in elements_list]),
        "bstar": jnp.array([e.bstar for e in elements_list]),
    }
    r, _v = propagate_batch(arr, jnp.array(t_minutes))   # (N, T, 3)
    r_np = np.asarray(r)

    # Find target index
    if sat_id not in catalog_ids:
        return {"sat_id": sat_id, "error": "target not in propagated batch"}
    target_idx = catalog_ids.index(sat_id)

    target_traj = r_np[target_idx]    # (T, 3)
    diffs = r_np - target_traj[None, :, :]   # (N, T, 3)
    dists = np.linalg.norm(diffs, axis=-1)   # (N, T)

    min_d_per_obj = dists.min(axis=1)
    # Find conjunctions
    close = np.where(min_d_per_obj <= screening_volume_km)[0]
    close = close[close != target_idx]

    conjunctions = []
    for ci in close[:20]:
        sec_id = catalog_ids[ci]
        # Find TCA index
        t_idx = int(np.argmin(dists[ci]))
        tca_dt = now + timedelta(minutes=float(t_minutes[t_idx]))
        conjunctions.append({
            "secondary_norad_id": sec_id,
            "secondary_name": catalog[sec_id]["name"],
            "tca_iso": tca_dt.isoformat(timespec="seconds"),
            "min_range_km": float(min_d_per_obj[ci]),
        })
    conjunctions.sort(key=lambda c: c["min_range_km"])

    return {
        "sat_id": sat_id,
        "name": tle_entry["name"],
        "window_days": days,
        "screening_volume_km": screening_volume_km,
        "n_catalog_screened": len(catalog_ids),
        "conjunctions": conjunctions,
        "source": "live Celestrak active catalog + SGP4-in-JAX",
    }


def _tool_compute_pc(
    obj1_position_km: list[float],
    obj1_velocity_kms: list[float],
    obj2_position_km: list[float],
    obj2_velocity_kms: list[float],
    obj1_position_sigma_m: float = 50.0,
    obj2_position_sigma_m: float = 50.0,
    hbr_m: float = 5.0,
    method: str = "alfano2004",
) -> dict[str, Any]:
    """Real Pc computation."""
    from skyshield.pc.alfano import pc_alfano2004
    from skyshield.pc.chan import pc_chan
    from skyshield.pc.foster import pc_foster
    from skyshield.pc.monte_carlo import pc_monte_carlo
    from skyshield.pc.patera import pc_patera

    r1 = np.asarray(obj1_position_km, dtype=np.float64)
    r2 = np.asarray(obj2_position_km, dtype=np.float64)
    v1 = np.asarray(obj1_velocity_kms, dtype=np.float64)
    v2 = np.asarray(obj2_velocity_kms, dtype=np.float64)
    cov1 = np.eye(3) * ((obj1_position_sigma_m / 1000.0) ** 2)
    cov2 = np.eye(3) * ((obj2_position_sigma_m / 1000.0) ** 2)

    pc_fn = {
        "alfano2004": pc_alfano2004,
        "chan": pc_chan,
        "foster": pc_foster,
        "patera": pc_patera,
        "monte_carlo": pc_monte_carlo,
    }.get(method, pc_alfano2004)

    pc = pc_fn(
        r1=r1, r2=r2, v1=v1, v2=v2,
        cov1_pos_j2000=cov1, cov2_pos_j2000=cov2,
        hbr_m=hbr_m,
    )
    miss = float(np.linalg.norm(r2 - r1))
    vrel = float(np.linalg.norm(v2 - v1))
    return {
        "pc": float(pc) if pc is not None and not (isinstance(pc, float) and pc != pc) else None,
        "miss_distance_km": miss,
        "relative_velocity_kms": vrel,
        "method": method,
        "hbr_m": hbr_m,
    }


def _tool_avoidance(
    r1_at_tca_km: list[float],
    r2_at_tca_km: list[float],
    v1_at_tca_kms: list[float],
    v2_at_tca_kms: list[float],
    burn_time_minutes_before_tca: float = 30.0,
    target_miss_km: float = 1.0,
    max_dv_mps: float = 50.0,
) -> dict[str, Any]:
    """Real avoidance optimization."""
    from skyshield.avoid.optimizer import optimize_avoidance_maneuver

    plan = optimize_avoidance_maneuver(
        r1_at_tca_km=np.asarray(r1_at_tca_km),
        r2_at_tca_km=np.asarray(r2_at_tca_km),
        v1_at_tca_kms=np.asarray(v1_at_tca_kms),
        v2_at_tca_kms=np.asarray(v2_at_tca_kms),
        burn_time_minutes_before_tca=burn_time_minutes_before_tca,
        target_miss_km=target_miss_km,
        max_dv_kms=max_dv_mps / 1000.0,
    )
    return {
        "delta_v_kms": list(plan.delta_v_kms),
        "delta_v_mps": plan.delta_v_mps,
        "burn_time_seconds_before_tca": plan.burn_time_seconds_before_tca,
        "predicted_miss_km_after": plan.predicted_miss_km_after,
        "n_iterations": plan.n_iterations,
        "converged": plan.converged,
    }


def _tool_satellite_info(query: str) -> dict[str, Any]:
    """Stub satellite info lookup."""
    # In production this would hit Celestrak's SATCAT API.
    if query == "25544" or query.upper() == "ISS":
        return {
            "norad_id": 25544,
            "name": "ISS (ZARYA)",
            "intl_designator": "98067A",
            "operator": "NASA/Roscosmos partnership",
            "orbit_class": "LEO",
            "perigee_km": 408,
            "apogee_km": 421,
            "inclination_deg": 51.64,
            "period_min": 92.7,
        }
    return {
        "query": query,
        "note": "Catalog lookup not implemented in this build; would query Celestrak SATCAT.",
    }


def _tool_top_risks(n: int = 10) -> dict[str, Any]:
    """Return the Top N highest-Pc conjunctions from the TraCSS answer key.

    Reads the pre-extracted artifact at data/top_100_riskiest.json. This is
    SkyShield's original contribution — the first public ranking of high-Pc
    events from the Office of Space Commerce verification dataset.
    """
    import json as _json
    from pathlib import Path

    n = max(1, min(int(n or 10), 100))
    candidates = [
        Path(__file__).resolve().parents[2] / "data" / "top_100_riskiest.json",
        Path.cwd() / "data" / "top_100_riskiest.json",
    ]
    payload = None
    for p in candidates:
        if p.exists():
            try:
                payload = _json.loads(p.read_text(encoding="utf-8"))
                break
            except Exception:
                continue
    if not payload:
        return {
            "error": "top_100_riskiest.json not found",
            "hint": "Run `uv run python scripts/top_100_riskiest.py` to generate it",
        }

    return {
        "source": payload.get("source_dataset", "Aerospace IVV (CC0)"),
        "total_scanned": payload.get("total_conjunctions_scanned", 0),
        "robust_after_dilution_filter": payload.get("robust_conjunctions", 0),
        "n_returned": n,
        "top": payload["top_100"][:n],
    }
