"""Explainable landing-site scoring (Phase 9).

Two layers, never a black box
-----------------------------
1. Hard requirements (gates). Same idea as the Slip Planner: sunlight %, longest darkness, Earth %, favorable
   ground within 100 m. A candidate that fails any gate is marked ineligible. The soft score is still shown so the
   failure is visible, but it is not ranked as a usable site.
2. Soft scores (0..1) for each factor, then a weighted average. Weights must be non-negative and are normalised to
   sum to 1. Each factor's contribution to the final score is weight_i * score_i, so the user can read "why".

Normalisation (transparent, fixed)
----------------------------------
  sunlight, earth, terrain : the measured fraction itself (already 0..1).
  darkness                 : 1 - longest_dark_hours / mission_hours  (clipped to 0..1).
                             Zero darkness -> 1; dark for the whole window -> 0.

Limits, reported to the user
----------------------------
  * Defaults are illustrative, not NASA requirements.
  * Visibility figures inherit the DEM-tile upper-bound caveat.
  * Terrain uses the illustrative Favorable thresholds (5° / 0.25 m).
  * The overall number is a weighted geometry summary, not a mission-success probability.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.services import ephemeris as eph
from app.services import horizon_analysis as ha
from app.services import terrain_analysis as ta
from app.services import terrain_service as ts
from app.services import visibility as vis

FACTORS = ("sunlight", "darkness", "earth", "terrain")
DEFAULT_WEIGHTS = {"sunlight": 0.35, "darkness": 0.25, "earth": 0.20, "terrain": 0.20}
DEFAULT_REQUIREMENTS = {"min_sun": 0.70, "max_dark_h": 48.0, "min_earth": 0.20, "min_favorable": 0.80}
MAX_CANDIDATES = 6


@dataclass
class Requirements:
    min_sun: float = 0.70
    max_dark_h: float = 48.0
    min_earth: float = 0.20
    min_favorable: float = 0.80


def normalize_weights(weights: dict[str, float] | None) -> dict[str, float]:
    w = {k: float((weights or DEFAULT_WEIGHTS).get(k, 0.0)) for k in FACTORS}
    if any(v < 0 for v in w.values()):
        raise ValueError("Weights must not be negative.")
    total = sum(w.values())
    if total <= 0:
        raise ValueError("At least one weight must be positive.")
    return {k: v / total for k, v in w.items()}


def parse_requirements(raw: dict | None) -> Requirements:
    r = {**DEFAULT_REQUIREMENTS, **(raw or {})}
    out = Requirements(float(r["min_sun"]), float(r["max_dark_h"]), float(r["min_earth"]), float(r["min_favorable"]))
    if not (0 <= out.min_sun <= 1 and 0 <= out.min_earth <= 1 and 0 <= out.min_favorable <= 1):
        raise ValueError("min_sun, min_earth and min_favorable must be between 0 and 1.")
    if out.max_dark_h < 0:
        raise ValueError("max_dark_h must not be negative.")
    return out


def factor_scores(sun_lit: float, dark_h: float, earth_view: float, favorable: float, mission_hours: float) -> dict[str, float]:
    dark = 0.0 if mission_hours <= 0 else max(0.0, min(1.0, 1.0 - dark_h / mission_hours))
    return {
        "sunlight": max(0.0, min(1.0, sun_lit)),
        "darkness": dark,
        "earth": max(0.0, min(1.0, earth_view)),
        "terrain": max(0.0, min(1.0, favorable)),
    }


def score_from_metrics(sun_lit: float, dark_h: float, earth_view: float, favorable: float, mission_hours: float,
                       req: Requirements, weights: dict[str, float]) -> dict:
    scores = factor_scores(sun_lit, dark_h, earth_view, favorable, mission_hours)
    gates = {
        "sunlight": sun_lit >= req.min_sun,
        "darkness": dark_h <= req.max_dark_h,
        "earth": earth_view >= req.min_earth,
        "terrain": favorable >= req.min_favorable,
    }
    contributions = {k: weights[k] * scores[k] for k in FACTORS}
    overall = sum(contributions.values())
    return {
        "eligible": all(gates.values()),
        "overall": round(overall, 4),
        "scores": {k: round(v, 4) for k, v in scores.items()},
        "contributions": {k: round(v, 4) for k, v in contributions.items()},
        "gates": gates,
        "metrics": {
            "sun_lit": sun_lit, "sun_dark_h": dark_h, "earth_view": earth_view, "favorable_share": favorable,
            "mission_hours": mission_hours,
        },
    }


def evaluate_point(site_id: str, kernel_dir, lat: float | None, lon: float | None, x: float | None, y: float | None,
                   start: datetime, stop: datetime, step: timedelta, observer_height_m: float,
                   req: Requirements, weights: dict[str, float], name: str = "") -> dict:
    s = ts.get_site(site_id)
    x, y, _, _ = ts.locate(s, lat, lon, x, y)
    profile = ha.horizon_profile(s, x, y, observer_height_m, az_step_deg=1.0, max_range_m=20000.0)
    vis_out = vis.analyse(profile, kernel_dir, start, stop, step)
    area = ts.area_summary(site_id, ta.HazardThresholds(), 100.0, x=x, y=y)
    favorable = float(area.hazard_fractions.get("Favorable", 0.0))
    mission_h = (stop - start).total_seconds() / 3600.0
    scored = score_from_metrics(vis_out["sun"]["fraction_of_time"], vis_out["sun"]["longest_hidden_hours"],
                                vis_out["earth"]["fraction_of_time"], favorable, mission_h, req, weights)
    upper = max(vis_out["sun_rays_truncated_share"], vis_out["earth_rays_truncated_share"]) > 0
    return {
        "name": name or f"{profile.latitude:.4f}°, {profile.longitude_east:.3f}°E",
        "site_id": site_id,
        "latitude": profile.latitude,
        "longitude_east": profile.longitude_east,
        "x_m": x,
        "y_m": y,
        "ground_elevation_m": profile.ground_elevation_m,
        "slope_p95_deg": area.slope_p95_deg,
        "roughness_mean_m": area.roughness_mean_m,
        "upper_bound": upper,
        "horizon_incomplete_fraction": float(profile.incomplete.mean()),
        **scored,
        "failed_gates": [k for k, ok in scored["gates"].items() if not ok],
    }


def compare(site_id: str, kernel_dir, candidates: list[dict], start: datetime, stop: datetime, step: timedelta,
            observer_height_m: float, req: Requirements, weights: dict[str, float]) -> dict:
    if not (1 <= len(candidates) <= MAX_CANDIDATES):
        raise ValueError(f"Provide between 1 and {MAX_CANDIDATES} candidates.")
    rows = []
    for i, c in enumerate(candidates):
        rows.append(evaluate_point(site_id, kernel_dir, c.get("lat"), c.get("lon"), c.get("x"), c.get("y"),
                                   start, stop, step, observer_height_m, req, weights, name=str(c.get("name") or f"Candidate {i + 1}")))
    # Eligible first (best overall), then ineligible by overall. Ties keep input order via stable sort.
    order = sorted(range(len(rows)), key=lambda i: (not rows[i]["eligible"], -rows[i]["overall"], i))
    for rank, i in enumerate(order, start=1):
        rows[i]["rank"] = rank
    ranked = [rows[i] for i in order]
    notes = [
        "Hard requirements decide eligibility. Soft scores only rank among sites that pass every gate.",
        "Weights are normalised to sum to 1. Contribution of a factor = weight × that factor's 0..1 score.",
        "Darkness score = 1 − (longest darkness / mission length). Terrain score = Favorable share within 100 m "
        "(illustrative 5° / 0.25 m thresholds).",
        "Visibility figures are upper bounds wherever horizon rays leave the DEM tile.",
        "The overall number is a weighted geometry summary, not a probability of mission success.",
    ]
    return {
        "site_id": site_id,
        "start_utc": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stop_utc": stop.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "step_minutes": step.total_seconds() / 60.0,
        "observer_height_m": observer_height_m,
        "requirements": req.__dict__,
        "weights": weights,
        "candidates": ranked,
        "eligible_count": sum(1 for r in ranked if r["eligible"]),
        "notes": notes,
        "definitions": {
            "eligible": "Passes every hard requirement (sunlight, darkness, Earth, favorable ground).",
            "overall": "Sum of weight_i × score_i over the four factors.",
            "sunlight_score": "Share of the mission window with some of the Sun above the terrain.",
            "darkness_score": "1 − longest_darkness / mission_length (0 if dark the whole window).",
            "earth_score": "Share of the window with Earth's centre above the terrain.",
            "terrain_score": "Share of 5 m pixels within 100 m classed Favorable.",
        },
    }
