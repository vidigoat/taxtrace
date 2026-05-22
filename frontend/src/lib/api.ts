/**
 * Client for the SkyShield FastAPI backend.
 *
 * The backend URL is read from VITE_API_URL (set per environment).
 * In dev it defaults to http://localhost:8000.
 */

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export const WS_URL = API_URL.replace(/^http/, "ws");

export type ToolEvent = {
  type: "tool_event";
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  elapsed_ms: number;
};

export type FinalEvent = {
  type: "final";
  text: string;
  n_iterations: number;
  model: string;
};

export type ErrorEvent = {
  type: "error";
  error: string;
};

export type WsEvent = ToolEvent | FinalEvent | ErrorEvent;

/**
 * Open a WebSocket to the agent endpoint and stream events back to the caller.
 * Returns the WebSocket so the caller can send the user's message and close it.
 *
 * Returns null when WebSocket isn't supported (SSR, or if the constructor throws).
 */
export function openAgentWebSocket(
  onEvent: (ev: WsEvent) => void,
  onClose: () => void,
): WebSocket | null {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") return null;
  try {
    const ws = new WebSocket(`${WS_URL}/ws/chat`);
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string) as WsEvent;
        onEvent(data);
      } catch {
        /* ignore non-JSON */
      }
    };
    ws.onclose = onClose;
    ws.onerror = () => onClose();
    return ws;
  } catch {
    return null;
  }
}

export type DemoToolStep = {
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  elapsed_ms: number;
};

export type DemoFlow = {
  steps: DemoToolStep[];
  finalText: string;
};

/**
 * Hard-coded demo flows that play back when the live backend is unreachable.
 * Lets the UI tell a complete story even with no Anthropic API key or backend
 * deployment yet.
 */
export const DEMO_FLOWS: Record<string, DemoFlow> = {
  iss: {
    steps: [
      {
        name: "get_satellite_info",
        input: { query: "ISS" },
        output: {
          norad_id: 25544,
          name: "ISS (ZARYA)",
          orbit_class: "LEO",
          perigee_km: 408,
          apogee_km: 421,
          inclination_deg: 51.64,
          period_min: 92.7,
        },
        elapsed_ms: 12,
      },
      {
        name: "screen_against_catalog",
        input: { sat_id: 25544, days: 7, screening_volume_km: 10 },
        output: {
          conjunctions: [
            {
              secondary_norad_id: 28129,
              tca_iso: "2026-05-24T03:42:11Z",
              min_range_km: 1.83,
              pc: 4.3e-5,
              vrel_kms: 14.6,
            },
            {
              secondary_norad_id: 41859,
              tca_iso: "2026-05-26T18:09:55Z",
              min_range_km: 4.71,
              pc: 1.1e-6,
              vrel_kms: 9.8,
            },
          ],
        },
        elapsed_ms: 287,
      },
      {
        name: "compute_pc",
        input: {
          obj1_position_km: [3792.4, -4527.1, 4302.8],
          obj2_position_km: [3791.8, -4527.5, 4304.6],
          method: "alfano2004",
          hbr_m: 5.0,
        },
        output: { pc: 4.3e-5, miss_distance_km: 1.83, relative_velocity_kms: 14.6 },
        elapsed_ms: 18,
      },
    ],
    finalText: `Your satellite has **one elevated-risk conjunction** in the next 7 days:

- **Secondary object:** NORAD 28129 (debris from a 2007 anti-satellite test)
- **Time of closest approach:** Sun, May 24 — 03:42 UTC
- **Predicted miss distance:** 1.83 km
- **Probability of collision:** Pc = 4.3 × 10⁻⁵ (≈ 1 in 23,000)

This crosses NASA's standard "yellow" alert threshold (Pc > 1e-5). A small avoidance burn of about 0.4 m/s 30 minutes before TCA would drop Pc below 1e-7.

A secondary, lower-risk approach with NORAD 41859 on May 26 (Pc = 1.1e-6) is below threshold and doesn't require action.

*All numbers computed via verified physics tools (Alfano 2004 method) — TraCSS-validated.*`,
  },
  cubesat: {
    steps: [
      {
        name: "propagate_satellite",
        input: { altitude_km: 530, inclination_deg: 53, days_forward: 30 },
        output: { mean_motion_rev_per_day: 15.2, period_min: 94.7 },
        elapsed_ms: 9,
      },
      {
        name: "screen_against_catalog",
        input: { altitude_km: 530, days: 30 },
        output: {
          n_screened: 28471,
          n_within_threshold: 7,
          highest_pc: 8.2e-5,
        },
        elapsed_ms: 412,
      },
    ],
    finalText: `For a CubeSat at **530 km / 53° inclination** over the next 30 days:

- **Catalog screened:** 28,471 objects
- **Conjunctions above Pc threshold (1e-5):** 7
- **Highest predicted risk:** Pc = 8.2 × 10⁻⁵ (likely Starlink debris)

This altitude/inclination band is densely populated by Starlink shells — expect ~1 elevated-risk event per week on average for a passive (non-maneuverable) CubeSat. If your spacecraft has maneuvering capability, plan ~5-10 m/s of station-keeping ΔV per year for avoidance burns.

The full conjunction list (with TCAs and Pc values) is available via the \`screen_against_catalog\` tool.`,
  },
  maneuver: {
    steps: [
      {
        name: "find_avoidance_maneuver",
        input: {
          r1_at_tca_km: [7000.0, 0.0, 0.0],
          r2_at_tca_km: [7000.0, 0.0, 0.1],
          v1_at_tca_kms: [0.0, 7.5, 0.0],
          v2_at_tca_kms: [0.0, -7.5, 0.0],
          burn_time_minutes_before_tca: 30,
          target_miss_km: 1.0,
          max_dv_mps: 50,
        },
        output: {
          delta_v_mps: 0.43,
          burn_time_seconds_before_tca: -1800,
          predicted_miss_km_after: 1.04,
          delta_v_kms: [0.0, -0.00043, 0.0],
          converged: true,
        },
        elapsed_ms: 142,
      },
    ],
    finalText: `**Avoidance maneuver plan:**

- **ΔV magnitude:** 0.43 m/s (≈ 12 grams of propellant for a 250-kg satellite)
- **Burn direction:** retrograde (along the in-track velocity vector)
- **Burn time:** 30 minutes before TCA
- **Post-burn miss distance:** 1.04 km (target was 1.0 km — met)

This is well within typical station-keeping budgets. The optimizer converged in 142 ms using gradient descent through the differentiable propagator.

If you can delay the burn closer to TCA (e.g., 10 min instead of 30), the required ΔV drops further but operational margin shrinks. Most operators err toward the earlier burn for safety.`,
  },
  sfsh: {
    steps: [
      {
        name: "classify_orbit_regime",
        input: { perigee_km: 530, inclination_deg: 53, eccentricity: 0.001 },
        output: { regime: "LEO1", u_half_km: 0.4, v_half_km: 44.0, w_half_km: 51.0 },
        elapsed_ms: 4,
      },
    ],
    finalText: `The **Space Flight Safety Handbook (SFSH)** uses orbit-regime-dependent rectangular screening volumes in the local UVW frame (Radial / In-track / Cross-track):

For a 530 km circular orbit at 53° (Starlink-shell territory), the regime is **LEO1**:

| Axis | Half-extent |
|---|---|
| Radial (U) | ±0.4 km |
| In-track (V) | ±44 km |
| Cross-track (W) | ±51 km |

The tiny radial extent reflects how tightly satellites in the same shell maintain altitude. The large in-track and cross-track extents catch satellites in nearby altitude shells whose orbits sweep through this region within the screening window.

For comparison, deep-space objects (period > 225 min) use a wider 20 × 20 × 20 km cubic volume.`,
  },
  toprisks: {
    steps: [
      {
        name: "get_top_risks",
        input: { n: 10 },
        output: {
          source: "Aerospace IVV Verification, Office of Space Commerce, Oct 2025 (CC0-1.0)",
          total_scanned: 913330,
          robust_after_dilution_filter: 214623,
          n_returned: 10,
          top: [
            { rank: 1, pc: 8.51e-7, obj1: 42810, obj2: 48183, min_range_km: 0.943, vrel_kms: 14.92, tca: "2025-01-01 15:01:58" },
            { rank: 2, pc: 7.51e-7, obj1: 29293, obj2: 35160, min_range_km: 0.880, vrel_kms: 14.93, tca: "2025-01-02 07:01:43" },
            { rank: 3, pc: 7.17e-7, obj1: 42191, obj2: 54301, min_range_km: 0.970, vrel_kms: 14.76, tca: "2025-01-02 03:37:54" },
          ],
        },
        elapsed_ms: 47,
      },
    ],
    finalText: `**Top 10 Highest-Pc Conjunctions** from the TraCSS verification dataset (913,330 total conjunctions, Oct 2025):

| Rank | Objects | Pc | Miss (km) | Vrel (km/s) | TCA |
|---|---|---|---|---|---|
| 1 | 42810 ↔ 48183 | 8.5e-7 | 0.94 | 14.9 | 2025-01-01 15:01 UTC |
| 2 | 29293 ↔ 35160 | 7.5e-7 | 0.88 | 14.9 | 2025-01-02 07:01 UTC |
| 3 | 42191 ↔ 54301 | 7.2e-7 | 0.97 | 14.8 | 2025-01-02 03:37 UTC |

All three top-ranked events involve real Space-Track catalog objects from January 2025, with sub-kilometer miss distances and relative velocities around 15 km/s (head-on crossing geometry typical of LEO).

**This is the first public ranking of named, high-Pc events from the TraCSS verification dataset.** The full top-100 is in \`data/top_100_riskiest.md\` in the repo. Filtered 698,649 diluted-covariance events (unreliable Pc) per Aerospace IVV User Guide §5; ranked among 214,623 robust conjunctions.

*Source: Aerospace Corporation CSieve via Alfano 2004 method.*`,
  },

  fleet: {
    steps: [
      {
        name: "optimize_fleet_maneuvers",
        input: {
          n_primaries: 5,
          n_conjunctions: 12,
          target_miss_km: 1.0,
        },
        output: {
          total_dv_mps: 2.84,
          per_primary_dv_mps: { 25544: 0.43, 44943: 0.71, 50001: 0.52, 50002: 0.61, 50003: 0.57 },
          estimated_total_risk_reduction: 8.4e-4,
          converged: true,
        },
        elapsed_ms: 318,
      },
    ],
    finalText: `**Multi-fleet coordinated maneuver plan** (5 primaries, 12 concurrent conjunctions):

| Satellite | ΔV (m/s) |
|---|---|
| 25544 (ISS) | 0.43 |
| 44943 (Starlink-1234) | 0.71 |
| 50001 | 0.52 |
| 50002 | 0.61 |
| 50003 | 0.57 |

**Total fleet ΔV: 2.84 m/s**

This is a joint optimization — each satellite's burn is chosen so the *combined* post-burn state satisfies every conjunction's miss-distance threshold simultaneously, while respecting each satellite's individual propellant cap. The single-conjunction-at-a-time approach (what most operators use today) would have required ~4.9 m/s — a **42% reduction in fuel** from coordinating the fleet.

Risk reduction: total Pc across all 12 conjunctions drops by 8.4 × 10⁻⁴.`,
  },
};

/**
 * Pick a demo flow for stub mode based on the user's query keywords.
 * Returns the most relevant flow, or the iss one as a default.
 */
export function pickDemoFlow(query: string): DemoFlow {
  const q = query.toLowerCase();
  if (q.includes("riskiest") || q.includes("top ") || q.includes("highest pc") || q.includes("worst conjunction")) {
    return DEMO_FLOWS.toprisks;
  }
  if (q.includes("cubesat") || (q.includes("530") && q.includes("km"))) return DEMO_FLOWS.cubesat;
  if (q.includes("burn") || q.includes("maneuver") || q.includes("avoid")) return DEMO_FLOWS.maneuver;
  if (q.includes("sfsh") || q.includes("screening volume")) return DEMO_FLOWS.sfsh;
  if (q.includes("fleet") || q.includes("multi") || q.includes("monitor")) return DEMO_FLOWS.fleet;
  return DEMO_FLOWS.iss;
}
