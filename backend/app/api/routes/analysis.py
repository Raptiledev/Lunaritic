from datetime import timedelta
from functools import lru_cache

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from app.api.routes.terrain import _guard
from app.core.config import settings
from app.schemas.analysis import AlternativesResponse, CalendarResponse, CompareRequest, CompareResponse, MapsResponse, MapsStatus, VisibilityResponse
from app.services import dem_service as dem
from app.services import ephemeris as eph
from app.services import horizon_analysis as ha
from app.services import illumination_maps as im
from app.services import scoring as sc
from app.services import terrain_analysis as ta
from app.services import terrain_service as ts
from app.services import visibility as vis

router = APIRouter(prefix="/analysis", tags=["analysis"])


def _visibility(site_id, lat, lon, x, y, observer_height_m, start, stop, step_min) -> dict:
    s = ts.get_site(site_id)
    x, y, _, _ = ts.locate(s, lat, lon, x, y)
    t0, t1 = eph.parse_utc(start), eph.parse_utc(stop)
    if t1 <= t0:
        raise ValueError("stop must be after start.")
    profile = ha.horizon_profile(s, x, y, observer_height_m, az_step_deg=1.0, max_range_m=20000.0)
    out = vis.analyse(profile, settings.kernel_dir, t0, t1, timedelta(minutes=step_min))
    upper = max(out["sun_rays_truncated_share"], out["earth_rays_truncated_share"]) > 0
    notes = [f"Time step {step_min:g} min: rise and set times are located to within about {step_min / 2:g} min.",
             "Geometry only. Sunlight is not electrical power, and Earth in view is not a guaranteed radio link."]
    if upper:
        notes.insert(0, f"{profile.incomplete.mean():.0%} of horizon rays leave the DEM tile before 20 km. Terrain beyond the tile "
                        "can only hide more sky, so these sunlight and Earth figures are UPPER bounds.")
    return {**out, "site_id": site_id, "latitude": profile.latitude, "longitude_east": profile.longitude_east,
            "ground_elevation_m": profile.ground_elevation_m, "observer_height_m": observer_height_m,
            "horizon_incomplete_fraction": float(profile.incomplete.mean()), "upper_bound": upper, "notes": notes,
            "definitions": {
                "sun_lit": "Some part of the solar disk (0.53° wide) is above the terrain horizon.",
                "sun_mean_disk_fraction": "Average share of the solar disk above the horizon over the window.",
                "earth_in_view": "The centre of Earth's disk (about 1.9° wide) is above the terrain horizon.",
                "longest_hidden": "Longest continuous run without the Sun (or Earth) in the window.",
                "horizon": "Terrain horizon from the LOLA 5 m DEM on a 1737.4 km sphere, 1° azimuth steps, 20 km range.",
                "ephemeris": "NAIF SPICE, DE421, MOON_ME frame, light time + stellar aberration; validated against JPL Horizons.",
            }}


MAP_DEFINITIONS = {
    "sun_lit": "Share of the window with some part of the solar disk above the terrain horizon (same rule as the point analysis).",
    "sun_disk": "Average share of the solar disk above the horizon over the window.",
    "sun_dark_h": "Longest continuous run without any sunlight, hours. What a battery must survive.",
    "earth_view": "Share of the window with the centre of Earth's disk above the terrain horizon.",
    "earth_gap_h": "Longest continuous run without Earth in view, hours.",
    "both": "Share of the window with sunlight and Earth in view at the same time.",
}
MAP_ROUND = {"sun_lit": 4, "sun_disk": 4, "earth_view": 4, "both": 4, "sun_dark_h": 2, "earth_gap_h": 2}


def _cache_dir():
    return settings.data_dir / "cache"


def _brightest(m: dict, grid: im.HorizonGrid, k: int = 5, min_sep_m: float = 500.0) -> list[dict]:
    """Most-sunlit cells (ties broken by shorter darkness, then more Earth time), at least min_sep_m apart."""
    L = m["layers"]
    lit, dark = np.nan_to_num(L["sun_lit"], nan=-1), np.nan_to_num(L["sun_dark_h"], nan=1e9)
    order = np.lexsort((-np.nan_to_num(L["earth_view"]).ravel(), dark.ravel(), -lit.ravel()))
    picked: list[dict] = []
    for idx in order:
        j, i = divmod(int(idx), grid.x.size)
        if lit[j, i] < 0:
            break
        x, y = float(grid.x[i]), float(grid.y[j])
        if all(np.hypot(x - p["x_m"], y - p["y_m"]) >= min_sep_m for p in picked):
            picked.append({"x_m": x, "y_m": y, "latitude": float(m["lat"][j, i]), "longitude_east": float(m["lon"][j, i]),
                           "sun_lit": float(lit[j, i]), "sun_dark_h": float(dark[j, i]), "earth_view": float(L["earth_view"][j, i])})
            if len(picked) == k:
                break
    return picked


@lru_cache(maxsize=8)
def _raw_maps(site_id: str, start: str, stop: str, step_min: float) -> tuple[im.HorizonGrid, dict]:
    ts.get_site(site_id)
    grid = im.load_grid(_cache_dir(), site_id)
    t0, t1 = eph.parse_utc(start), eph.parse_utc(stop)
    if t1 <= t0:
        raise ValueError("stop must be after start.")
    return grid, im.window_maps(grid, settings.kernel_dir, t0, t1, timedelta(minutes=step_min))


@lru_cache(maxsize=8)
def _maps(site_id: str, start: str, stop: str, step_min: float) -> dict:
    grid, m = _raw_maps(site_id, start, stop, step_min)
    sp = grid.spacing_m
    layers, stats = {}, {}
    for k, a in m["layers"].items():
        d = MAP_ROUND[k]
        layers[k] = [None if not np.isfinite(v) else round(float(v), d) for v in a.ravel()]
        ok = a[np.isfinite(a)]
        stats[k] = {"min": float(ok.min()) if ok.size else None, "max": float(ok.max()) if ok.size else None,
                    "mean": float(ok.mean()) if ok.size else None}
    inc = float(np.nanmean(grid.incomplete))
    notes = [f"Each cell is one {sp:g} m grid node; sunlight can change within metres near ridges and shadow edges, "
             "so check a chosen spot with the point analysis.",
             f"Observer {grid.observer_height_m:g} m above the ground everywhere (the grid's fixed height, not the mission form's).",
             f"Time step {step_min:g} min."]
    if inc > 0:
        notes.insert(0, f"On average {inc:.0%} of horizon rays leave the DEM tile before 20 km. Terrain beyond the tile can only "
                        "hide more sky, so every value on these maps is an UPPER bound (darkness values are lower bounds).")
    times = m["times"]
    return {"site_id": site_id, "spacing_m": sp, "observer_height_m": grid.observer_height_m, "nx": int(grid.x.size), "ny": int(grid.y.size),
            "bounds_xy_m": (float(grid.x[0] - sp / 2), float(grid.y[-1] - sp / 2), float(grid.x[-1] + sp / 2), float(grid.y[0] + sp / 2)),
            "start_utc": times[0].strftime("%Y-%m-%dT%H:%M:%SZ"), "stop_utc": times[-1].strftime("%Y-%m-%dT%H:%M:%SZ"),
            "step_minutes": step_min, "n_samples": m["n_samples"], "compute_seconds": round(m["compute_seconds"], 2),
            "grid_built_utc": grid.built_utc, "layers": layers, "stats": stats, "brightest": _brightest(m, grid),
            "horizon_incomplete_mean": inc, "upper_bound": inc > 0, "definitions": MAP_DEFINITIONS, "notes": notes}


@router.get("/{site_id}/maps/status", response_model=MapsStatus)
def maps_status(site_id: str) -> dict:
    _guard(ts.get_site, site_id)
    cmd = f"cd backend; python -m scripts.build_horizon_grid --site {site_id}"
    try:
        g = im.load_grid(_cache_dir(), site_id)
        return {"site_id": site_id, "built": True, "spacing_m": g.spacing_m, "observer_height_m": g.observer_height_m,
                "built_utc": g.built_utc, "nodes": int(g.valid.sum()), "build_command": cmd}
    except im.GridNotBuilt:
        return {"site_id": site_id, "built": False, "spacing_m": im.DEFAULT_SPACING_M, "observer_height_m": im.DEFAULT_OBSERVER_HEIGHT_M,
                "built_utc": None, "nodes": None, "build_command": cmd}


def _run(fn, *a):
    try:
        return _guard(fn, *a)
    except im.GridNotBuilt as e:
        raise HTTPException(409, str(e))
    except eph.EphemerisUnavailable as e:
        raise HTTPException(503, str(e))
    except HTTPException:
        raise
    except Exception as e:   # SPICE errors, e.g. a date outside kernel coverage (1900-2050)
        raise HTTPException(422, f"SPICE could not compute this window: {type(e).__name__}: {str(e).strip()[:300]}")


@router.get("/{site_id}/maps", response_model=MapsResponse)
def maps(site_id: str, start: str, stop: str, step_min: float = Query(30.0, ge=5, le=720)) -> dict:
    return _run(_maps, site_id, start, stop, step_min)


@router.get("/{site_id}/visibility", response_model=VisibilityResponse)
def visibility(site_id: str, start: str, stop: str, lat: float | None = None, lon: float | None = None,
               x: float | None = None, y: float | None = None, observer_height_m: float = Query(2.0, ge=0, le=100),
               step_min: float = Query(10.0, ge=1, le=720)) -> dict:
    return _run(_visibility, site_id, lat, lon, x, y, observer_height_m, start, stop, step_min)


@router.post("/{site_id}/compare", response_model=CompareResponse)
def compare(site_id: str, body: CompareRequest) -> dict:
    """Rank candidate points for one mission window with hard gates + weighted soft scores."""
    def _do():
        t0, t1 = eph.parse_utc(body.start), eph.parse_utc(body.stop)
        if t1 <= t0:
            raise ValueError("stop must be after start.")
        if not (0 <= body.observer_height_m <= 100):
            raise ValueError("observer_height_m must be between 0 and 100.")
        if not (5 <= body.step_min <= 720):
            raise ValueError("step_min must be between 5 and 720.")
        req, weights = sc.parse_requirements(body.requirements), sc.normalize_weights(body.weights)
        cands = [c.model_dump() for c in body.candidates]
        return sc.compare(site_id, settings.kernel_dir, cands, t0, t1, timedelta(minutes=body.step_min),
                          body.observer_height_m, req, weights)
    return _run(_do)


# ---- Slip Planner ---------------------------------------------------------------------------------------------------

def _calendar(site_id, lat, lon, x, y, observer_height_m, first_start, n_days, duration_days, step_min) -> dict:
    s = ts.get_site(site_id)
    x, y, _, _ = ts.locate(s, lat, lon, x, y)
    profile = ha.horizon_profile(s, x, y, observer_height_m, az_step_deg=1.0, max_range_m=20000.0)
    out = vis.calendar(profile, settings.kernel_dir, eph.parse_utc(first_start), n_days, timedelta(days=duration_days),
                       timedelta(minutes=step_min))
    notes = [f"Each day is a full {duration_days:g}-day mission window starting at the same time of day, evaluated with the same "
             "rules as the Analysis page.", f"Time step {step_min:g} min."]
    if profile.incomplete.any():
        notes.insert(0, f"{profile.incomplete.mean():.0%} of horizon rays leave the DEM tile: sunlight and Earth shares are UPPER "
                        "bounds and darkness values LOWER bounds.")
    return {**out, "site_id": site_id, "latitude": profile.latitude, "longitude_east": profile.longitude_east, "x_m": x, "y_m": y,
            "ground_elevation_m": profile.ground_elevation_m, "observer_height_m": observer_height_m,
            "duration_days": duration_days, "upper_bound": bool(profile.incomplete.any()), "notes": notes}


@router.get("/{site_id}/calendar", response_model=CalendarResponse)
def landing_calendar(site_id: str, first_start: str, n_days: int = Query(120, ge=1, le=400),
                     duration_days: float = Query(14.0, gt=0, le=60), lat: float | None = None, lon: float | None = None,
                     x: float | None = None, y: float | None = None, observer_height_m: float = Query(2.0, ge=0, le=100),
                     step_min: float = Query(30.0, ge=5, le=720)) -> dict:
    return _run(_calendar, site_id, lat, lon, x, y, observer_height_m, first_start, n_days, duration_days, step_min)


@lru_cache(maxsize=4)
def _cell_terrain(site_id: str, spacing_m: float) -> tuple[np.ndarray, np.ndarray]:
    """Per map cell: share of 5 m pixels classed Favorable (default thresholds) and the 95th-percentile slope."""
    s, p = ts.get_site(site_id), ts.get_products(site_id)
    k = int(round(spacing_m / s.pixel_size_m))
    ny, nx = s.shape[0] // k, s.shape[1] // k
    blocks = lambda a: a[: ny * k, : nx * k].reshape(ny, k, nx, k).swapaxes(1, 2).reshape(ny, nx, k * k)
    fav = (blocks(ts.hazard_map(site_id, ta.HazardThresholds())) == ta.HAZ_FAVORABLE).mean(axis=-1)
    return fav, np.nanpercentile(blocks(p["slope"]), 95, axis=-1)


def _alternatives(site_id, lat, lon, x, y, start, stop, min_sun, max_dark_h, min_earth, min_favorable, radius_m, limit, step_min):
    s = ts.get_site(site_id)
    x, y, _, _ = ts.locate(s, lat, lon, x, y)
    grid, m = _raw_maps(site_id, start, stop, step_min)
    fav, slope95 = _cell_terrain(site_id, grid.spacing_m)
    if fav.shape != grid.ground.shape:
        raise ValueError("The horizon grid does not line up with the DEM's 100 m blocks; rebuild it.")
    L = m["layers"]
    xx, yy = np.meshgrid(grid.x, grid.y)
    dist = np.hypot(xx - x, yy - y)
    checks = {"sunlight": np.nan_to_num(L["sun_lit"], nan=-1) >= min_sun, "darkness": np.nan_to_num(L["sun_dark_h"], nan=1e9) <= max_dark_h,
              "earth": np.nan_to_num(L["earth_view"], nan=-1) >= min_earth, "terrain": fav >= min_favorable}
    ok = checks["sunlight"] & checks["darkness"] & checks["earth"] & checks["terrain"]
    lon_t = dem.xy_to_latlon(x, y)[1]

    def cell(j: int, i: int) -> dict:
        dx, dy = float(grid.x[i] - x), float(grid.y[j] - y)
        return {"x_m": float(grid.x[i]), "y_m": float(grid.y[j]), "latitude": float(m["lat"][j, i]), "longitude_east": float(m["lon"][j, i]),
                "distance_m": float(np.hypot(dx, dy)), "bearing_true_deg": float((np.degrees(np.arctan2(dx, dy)) - lon_t) % 360),
                "sun_lit": float(L["sun_lit"][j, i]), "sun_dark_h": float(L["sun_dark_h"][j, i]), "earth_view": float(L["earth_view"][j, i]),
                "both": float(L["both"][j, i]), "favorable_share": float(fav[j, i]), "slope_p95_deg": float(slope95[j, i]),
                "passes": {k: bool(v[j, i]) for k, v in checks.items()}}

    picked: list[dict] = []
    for idx in np.argsort(np.where(ok & (dist <= radius_m), dist, np.inf), axis=None):
        j, i = divmod(int(idx), grid.x.size)
        if not np.isfinite(dist[j, i]) or not ok[j, i] or dist[j, i] > radius_m:
            break
        if all(np.hypot(grid.x[i] - c["x_m"], grid.y[j] - c["y_m"]) >= 300 for c in picked):
            picked.append(cell(j, i))
            if len(picked) == limit:
                break
    # The target itself is analysed exactly at its own coordinates, not read from its 100 m cell: on a ridge a few tens of
    # metres change the answer, and the alternatives are exact for their own (cell-centre) coordinates too.
    jt, it = int(np.argmin(np.abs(grid.y - y))), int(np.argmin(np.abs(grid.x - x)))
    p = ha.horizon_profile(s, x, y, grid.observer_height_m, az_step_deg=1.0, max_range_m=im.MAX_RANGE_M)
    r = vis.analyse(p, settings.kernel_dir, eph.parse_utc(start), eph.parse_utc(stop), timedelta(minutes=step_min))
    vals = {"sun_lit": r["sun"]["fraction_of_time"], "sun_dark_h": r["sun"]["longest_hidden_hours"],
            "earth_view": r["earth"]["fraction_of_time"], "both": r["both_fraction_of_time"]}
    target = {**cell(jt, it), **vals, "x_m": x, "y_m": y, "latitude": p.latitude, "longitude_east": p.longitude_east,
              "distance_m": 0.0, "bearing_true_deg": 0.0}
    target["passes"] = {"sunlight": vals["sun_lit"] >= min_sun, "darkness": vals["sun_dark_h"] <= max_dark_h,
                        "earth": vals["earth_view"] >= min_earth, "terrain": target["favorable_share"] >= min_favorable}
    return {"site_id": site_id, "start_utc": start, "stop_utc": stop, "radius_m": radius_m,
            "requirements": {"min_sun": min_sun, "max_dark_h": max_dark_h, "min_earth": min_earth, "min_favorable": min_favorable},
            "target": target, "alternatives": picked, "cells_passing_in_tile": int(ok.sum()),
            "notes": [f"Values are for {grid.spacing_m:g} m cells from the mission-window maps (observer {grid.observer_height_m:g} m); "
                      "confirm a chosen spot with the point analysis.",
                      "Terrain test: share of 5 m pixels in the cell classed Favorable under the illustrative 5°/0.25 m thresholds.",
                      "Upper bounds: terrain beyond the tile is unknown, so real sunlight and Earth time can only be lower."]}


@router.get("/{site_id}/alternatives", response_model=AlternativesResponse)
def alternatives(site_id: str, start: str, stop: str, lat: float | None = None, lon: float | None = None, x: float | None = None,
                 y: float | None = None, min_sun: float = Query(0.7, ge=0, le=1), max_dark_h: float = Query(48.0, ge=0),
                 min_earth: float = Query(0.2, ge=0, le=1), min_favorable: float = Query(0.8, ge=0, le=1),
                 radius_m: float = Query(3000.0, gt=0, le=25000), limit: int = Query(6, ge=1, le=20),
                 step_min: float = Query(30.0, ge=5, le=720)) -> dict:
    return _run(_alternatives, site_id, lat, lon, x, y, start, stop, min_sun, max_dark_h, min_earth, min_favorable, radius_m, limit, step_min)
