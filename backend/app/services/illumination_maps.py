"""Sunlight, Earth-visibility and longest-darkness maps over a whole DEM tile (Phase 6).

Two stages
----------
1. Horizon grid (slow, built once, cached on disk). The Phase 3 engine (horizon_analysis.horizon_profile: 1 deg azimuth
   steps, 20 km range, sphere geometry) is run at every node of a regular grid (default 100 m) for an observer at a
   fixed height above the ground (default 2 m). Build it with `python -m scripts.build_horizon_grid`.
2. Window maps (fast, per mission window). SPICE gives the apparent Sun and Earth vectors once, from the grid centre.
   For every other node the vector is translated exactly, v_node = v_centre + (p_centre - p_node); the light-time and
   aberration difference across the tile is negligible. The vector is then rotated into that node's own East/North/Up,
   so every node gets its own azimuth and elevation (they differ by up to ~0.8 deg across the tile, which matters
   when the Sun is only ~1.5 deg high).

Definitions match the single-point analysis (visibility.py): lit = some part of the solar disk above the terrain
horizon; Earth in view = at least half of Earth's disk above it; longest darkness = longest run of unlit samples,
counted the same way. The disk test is the same strip method with fewer strips (N_STRIPS).

Limits, reported to the user:
  * Where rays leave the tile the horizon is a lower bound, so the maps are UPPER bounds.
  * A node stands for its whole cell, but sunlight can change within metres near ridges and shadow edges.
  * The observer height is the grid's fixed value, not the mission form's lander height.
"""
from __future__ import annotations

import os
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.services import dem_service as dem
from app.services import ephemeris as eph
from app.services import horizon_analysis as ha
from app.services.visibility import EARTH_VISIBLE_MIN_FRACTION

DEFAULT_SPACING_M = 100.0
DEFAULT_OBSERVER_HEIGHT_M = 2.0
MAX_RANGE_M = 20000.0
N_AZ = 360
N_STRIPS = 15
MAX_SAMPLES = 1500
CHUNK = 256


class GridNotBuilt(Exception):
    pass


def grid_path(cache_dir: Path, site_id: str, spacing_m: float = DEFAULT_SPACING_M,
              observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M) -> Path:
    return cache_dir / f"horizon_grid_{site_id}_{spacing_m:g}m_h{observer_height_m:g}m.npz"


def grid_nodes(bounds_xy: tuple[float, float, float, float], spacing_m: float) -> tuple[np.ndarray, np.ndarray]:
    """Cell-centre x (left to right) and y (top to bottom, like image rows) of a regular grid inside the bounds."""
    xmin, ymin, xmax, ymax = bounds_xy
    return np.arange(xmin + spacing_m / 2, xmax, spacing_m), np.arange(ymax - spacing_m / 2, ymin, -spacing_m)


# ---- stage 1: horizon grid ------------------------------------------------------------------------------------------

_worker_site: dem.SiteDEM | None = None


def _init_worker(dem_dir: str, site_id: str) -> None:
    global _worker_site
    _worker_site = dem.load_site(Path(dem_dir), site_id, surf_only=True)


def _row(args: tuple[float, np.ndarray, float]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    y, xs, h_obs = args
    ground = np.full(len(xs), np.nan, dtype="float32")
    horizon = np.full((len(xs), N_AZ), np.nan, dtype="float32")
    incomplete = np.full(len(xs), np.nan, dtype="float32")
    for i, x in enumerate(xs):
        try:
            p = ha.horizon_profile(_worker_site, float(x), float(y), h_obs, az_step_deg=360.0 / N_AZ, max_range_m=MAX_RANGE_M)
        except ValueError:          # no ground elevation at this node
            continue
        ground[i], horizon[i], incomplete[i] = p.ground_elevation_m, p.horizon_deg, p.incomplete.mean()
    return ground, horizon, incomplete


def build_horizon_grid(dem_dir: Path, cache_dir: Path, site_id: str, spacing_m: float = DEFAULT_SPACING_M,
                       observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M, workers: int | None = None,
                       progress=None) -> Path:
    site = dem.load_site(dem_dir, site_id, surf_only=True)
    xs, ys = grid_nodes(site.bounds_xy, spacing_m)
    del site
    workers = workers or max(1, min(8, (os.cpu_count() or 2) - 2))
    ground = np.full((len(ys), len(xs)), np.nan, dtype="float32")
    horizon = np.full((len(ys), len(xs), N_AZ), np.nan, dtype="float32")
    incomplete = np.full((len(ys), len(xs)), np.nan, dtype="float32")
    t0 = time.time()
    with ProcessPoolExecutor(workers, initializer=_init_worker, initargs=(str(dem_dir), site_id)) as pool:
        for j, (g, h, inc) in enumerate(pool.map(_row, [(float(y), xs, observer_height_m) for y in ys])):
            ground[j], horizon[j], incomplete[j] = g, h, inc
            if progress:
                progress(j + 1, len(ys), time.time() - t0)
    out = grid_path(cache_dir, site_id, spacing_m, observer_height_m)
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out, site_id=site_id, spacing_m=spacing_m, observer_height_m=observer_height_m, x=xs, y=ys,
                        ground=ground, horizon=horizon, incomplete=incomplete, max_range_m=MAX_RANGE_M,
                        built_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    return out


@dataclass
class HorizonGrid:
    site_id: str
    spacing_m: float
    observer_height_m: float
    x: np.ndarray            # (nx,)
    y: np.ndarray            # (ny,) top to bottom
    ground: np.ndarray       # (ny, nx) metres, NaN where the DEM has no value
    horizon: np.ndarray      # (ny, nx, 360) degrees by TRUE azimuth 0..359, NaN gaps filled
    incomplete: np.ndarray   # (ny, nx) share of rays that left the data before MAX_RANGE_M
    built_utc: str
    path: Path

    @property
    def valid(self) -> np.ndarray:
        return np.isfinite(self.ground)


def _fill_gaps(h: np.ndarray) -> np.ndarray:
    """Same rule as horizon_analysis.horizon_at: NaN azimuths take the periodic interpolation of their neighbours."""
    az = np.arange(N_AZ, dtype=float)
    for idx in zip(*np.nonzero(np.isnan(h).any(axis=-1))):
        row = h[idx]
        ok = np.isfinite(row)
        h[idx] = np.interp(az, az[ok], row[ok], period=360.0) if ok.any() else -90.0
    return h


@lru_cache(maxsize=2)
def _load(path: Path, mtime: float) -> HorizonGrid:
    d = np.load(path)
    return HorizonGrid(str(d["site_id"]), float(d["spacing_m"]), float(d["observer_height_m"]), d["x"], d["y"], d["ground"],
                       _fill_gaps(d["horizon"].astype("float32")), d["incomplete"], str(d["built_utc"]), path)


def load_grid(cache_dir: Path, site_id: str, spacing_m: float = DEFAULT_SPACING_M,
              observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M) -> HorizonGrid:
    p = grid_path(cache_dir, site_id, spacing_m, observer_height_m)
    if not p.is_file():
        raise GridNotBuilt(f"No horizon grid for {site_id} at {spacing_m:g} m. Build it once with: "
                           f"python -m scripts.build_horizon_grid --site {site_id} (about 5-10 minutes).")
    return _load(p, p.stat().st_mtime)


# ---- stage 2: maps for a mission window ---------------------------------------------------------------------------

def _enu(lat_deg: np.ndarray, lon_deg: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    la, lo = np.radians(lat_deg), np.radians(lon_deg)
    east = np.stack([-np.sin(lo), np.cos(lo), np.zeros_like(lo)], axis=-1)
    north = np.stack([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)], axis=-1)
    up = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)
    return east, north, up


def disk_fractions(horizon: np.ndarray, node: np.ndarray, az: np.ndarray, el: np.ndarray, rad: np.ndarray,
                   n: int = N_STRIPS) -> np.ndarray:
    """Strip-method visible disk fraction. horizon (P, 360); node, az, el, rad flat (M,), node indexes horizon rows."""
    u = np.linspace(-1.0, 1.0, n, dtype="float32") * rad[:, None]                        # (M, n)
    w = np.sqrt(np.clip(rad[:, None] ** 2 - u**2, 0, None))
    a = (az[:, None] + u / np.maximum(np.cos(np.radians(el)), 1e-3)[:, None]) % 360.0
    i0 = np.floor(a).astype(np.int32)
    f = a - i0
    rows = node[:, None]
    h = horizon[rows, i0 % N_AZ] * (1 - f) + horizon[rows, (i0 + 1) % N_AZ] * f
    e = el[:, None]
    visible = np.clip(e + w - np.maximum(e - w, h), 0, None).sum(axis=-1)
    total = (2 * w).sum(axis=-1)
    return np.where(total > 0, visible / np.where(total > 0, total, 1), 0.0)


def envelope(horizon: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Max / min horizon over azimuth bins i-1..i+2: every strip of a disk centred in bin i with a half-width up to
    1 deg interpolates only between those bins, so the disk is wholly visible if its bottom clears the max and
    wholly hidden if its top is below the min. Exact shortcut, not an approximation."""
    shifted = [np.roll(horizon, -k, axis=1) for k in (-1, 0, 1, 2)]
    return np.maximum.reduce(shifted), np.minimum.reduce(shifted)


def fractions(horizon: np.ndarray, hmax: np.ndarray, hmin: np.ndarray, az: np.ndarray, el: np.ndarray,
              rad: np.ndarray) -> np.ndarray:
    """Visible disk fraction for (P, T) epochs, running the strip method only where the disk meets the terrain."""
    node = np.broadcast_to(np.arange(horizon.shape[0])[:, None], az.shape)
    i = np.floor(az).astype(np.int32) % N_AZ
    half_width = rad / np.maximum(np.cos(np.radians(el)), 1e-3)
    narrow = half_width <= 1.0
    clear = narrow & (el - rad >= hmax[node, i])
    hard = ~clear & ~(narrow & (el + rad <= hmin[node, i]))
    out = clear.astype(float)
    if hard.any():
        out[hard] = disk_fractions(horizon, node[hard], az[hard], el[hard], rad[hard])
    return out


def longest_run_samples(mask: np.ndarray) -> np.ndarray:
    """Per row, the longest run of True counted like visibility._periods: the last sample is the window end, not a step."""
    cur = np.zeros(mask.shape[0], dtype=np.int32)
    best = np.zeros_like(cur)
    for t in range(mask.shape[1] - 1):
        cur = (cur + 1) * mask[:, t]
        np.maximum(best, cur, out=best)
    return best


def window_maps(grid: HorizonGrid, kernel_dir: Path, start: datetime, stop: datetime, step: timedelta) -> dict:
    times = eph.epochs(start, stop, step)
    if len(times) > MAX_SAMPLES:
        raise ValueError(f"{len(times)} time samples requested; the map limit is {MAX_SAMPLES}. Use a larger step.")
    t0 = time.time()
    valid = grid.valid
    xx, yy = np.meshgrid(grid.x, grid.y)
    lat, lon = _latlon(xx[valid], yy[valid])
    height = grid.ground[valid].astype(float) + grid.observer_height_m
    R = (dem.MOON_RADIUS_M + height) / 1000.0
    la, lo = np.radians(lat), np.radians(lon)
    P = np.stack([R * np.cos(la) * np.cos(lo), R * np.cos(la) * np.sin(lo), R * np.sin(la)], axis=-1)   # (N, 3) km
    pc = P.mean(axis=0)
    vec = eph.body_vectors(kernel_dir, pc, times, ("SUN", "EARTH"))
    E, Nn, U = _enu(lat, lon)
    H = grid.horizon[valid]                                                                  # (N, 360)
    hmax, hmin = envelope(H)
    n, T = len(P), len(times)
    step_h = step.total_seconds() / 3600.0
    res = {k: np.empty(n) for k in ("sun_lit", "sun_disk", "sun_dark_h", "earth_view", "earth_gap_h", "both")}

    for a in range(0, n, CHUNK):
        b = min(a + CHUNK, n)
        d = (pc - P[a:b])[:, None, :]                                                        # (p, 1, 3)
        frac = {}
        for body in ("SUN", "EARTH"):
            v = vec[body][None, :, :] + d                                                    # (p, T, 3)
            dist = np.linalg.norm(v, axis=-1)
            el = np.degrees(np.arcsin(np.einsum("ptk,pk->pt", v, U[a:b]) / dist))
            az = np.degrees(np.arctan2(np.einsum("ptk,pk->pt", v, E[a:b]), np.einsum("ptk,pk->pt", v, Nn[a:b]))) % 360.0
            rad = np.degrees(np.arcsin(eph.BODY_RADIUS_KM[body] / dist))
            frac[body] = fractions(H[a:b], hmax[a:b], hmin[a:b], az, el, rad)
        lit, view = frac["SUN"] > 0, frac["EARTH"] >= EARTH_VISIBLE_MIN_FRACTION
        res["sun_lit"][a:b], res["sun_disk"][a:b] = lit.mean(axis=1), frac["SUN"].mean(axis=1)
        res["earth_view"][a:b], res["both"][a:b] = view.mean(axis=1), (lit & view).mean(axis=1)
        res["sun_dark_h"][a:b] = longest_run_samples(~lit) * step_h
        res["earth_gap_h"][a:b] = longest_run_samples(~view) * step_h

    def full(v: np.ndarray) -> np.ndarray:
        out = np.full(valid.shape, np.nan)
        out[valid] = v
        return out

    return {"times": times, "n_samples": T, "step_hours": step_h, "compute_seconds": time.time() - t0,
            "layers": {k: full(v) for k, v in res.items()}, "lat": full(lat), "lon": full(lon)}


def _latlon(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Inverse south polar stereographic on the DEM sphere (lat_0=-90, lon_0=0, k=1), same as dem_service."""
    rho = np.hypot(x, y)
    lat = np.degrees(2 * np.arctan(rho / (2 * dem.MOON_RADIUS_M))) - 90.0
    lon = np.degrees(np.arctan2(x, y)) % 360.0
    return lat, lon
