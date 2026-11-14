"""Cached terrain products, PNG rendering and point/area queries for loaded site DEMs."""
from __future__ import annotations

import io
from functools import lru_cache

import numpy as np
from PIL import Image

from app.core.config import settings
from app.schemas.terrain import AreaSummary, HorizonResponse, PointInfo, SiteInfo
from app.services import dem_service as dem
from app.services import horizon_analysis as ha
from app.services import terrain_analysis as ta

LAYERS = ("elevation", "slope", "hillshade", "roughness", "hazard", "lola_count", "z_uncertainty")


class SiteNotFound(Exception):
    pass


class OutsideCoverage(Exception):
    pass


def prepare_dems() -> None:
    """Download Site01 GeoTIFFs from PGDA when they are not already cached."""
    if not settings.remote_data:
        return
    from app.services.remote_data import ensure_site_dems
    ensure_site_dems()


@lru_cache(maxsize=4)
def get_site(site_id: str) -> dem.SiteDEM:
    prepare_dems()
    if site_id not in dem.list_site_ids(settings.dem_dir):
        raise SiteNotFound(site_id)
    return dem.load_site(settings.dem_dir, site_id)


@lru_cache(maxsize=4)
def get_products(site_id: str) -> dict[str, np.ndarray]:
    s = get_site(site_id)
    z, dx = s.layers["surf"], s.pixel_size_m
    slope, aspect = ta.slope_aspect(z, dx)
    return {"slope": slope, "aspect": aspect, "hillshade": ta.hillshade(z, dx),
            "roughness": ta.roughness(z, 5), "relief": ta.local_relief(z, 11)}


def hazard_map(site_id: str, t: ta.HazardThresholds) -> np.ndarray:
    p, s = get_products(site_id), get_site(site_id)
    return ta.classify_hazard(p["slope"], p["roughness"], s.layers.get("slperr"), t)


def site_info(site_id: str) -> SiteInfo:
    s = get_site(site_id)
    ext = s.extent_latlon()
    return SiteInfo(site_id=site_id, files=s.files, shape_px=s.shape, pixel_size_m=s.pixel_size_m, bounds_xy_m=s.bounds_xy,
                    lat_min=ext["lat_min"], lat_max=ext["lat_max"], layers_available=list(s.layers))


def _f(v) -> float | None:
    return None if v is None or not np.isfinite(v) else float(v)


def _layer_value(s: dem.SiteDEM, name: str, r: int, c: int):
    arr = s.layers.get(name)
    return None if arr is None else _f(arr[r, c])


def locate(s: dem.SiteDEM, lat=None, lon=None, x=None, y=None) -> tuple[float, float, int, int]:
    if x is None or y is None:
        if lat is None or lon is None:
            raise ValueError("Provide either lat and lon, or x and y.")
        x, y = dem.latlon_to_xy(lat, lon)
    rc = s.xy_to_rowcol(x, y)
    if rc is None:
        raise OutsideCoverage(f"Point (x={x:.0f} m, y={y:.0f} m) is outside this DEM, which covers {s.bounds_xy}.")
    return x, y, rc[0], rc[1]


def point_info(site_id: str, t: ta.HazardThresholds, lat=None, lon=None, x=None, y=None) -> PointInfo:
    s, p = get_site(site_id), get_products(site_id)
    x, y, r, c = locate(s, lat, lon, x, y)
    la, lo = dem.xy_to_latlon(x, y)
    hz = int(hazard_map_window(s, p, t, r, c))
    return PointInfo(x_m=x, y_m=y, latitude=la, longitude_east=lo, row=r, col=c,
                     elevation_m=_layer_value(s, "surf", r, c), slope_deg=_f(p["slope"][r, c]), aspect_deg_grid_north=_f(p["aspect"][r, c]),
                     roughness_rms_m=_f(p["roughness"][r, c]), relief_m=_f(p["relief"][r, c]),
                     lola_returns_in_pixel=_layer_value(s, "ldec", r, c), total_z_uncertainty_m=_layer_value(s, "toterr", r, c),
                     slope_uncertainty_deg=_layer_value(s, "slperr", r, c), hazard=ta.HAZ_LABELS[hz])


def hazard_map_window(s, p, t, r, c) -> int:
    sl, ro = p["slope"][r:r + 1, c:c + 1], p["roughness"][r:r + 1, c:c + 1]
    se = s.layers["slperr"][r:r + 1, c:c + 1] if "slperr" in s.layers else None
    return int(ta.classify_hazard(sl, ro, se, t)[0, 0])


def area_summary(site_id: str, t: ta.HazardThresholds, radius_m: float, lat=None, lon=None, x=None, y=None) -> AreaSummary:
    s, p = get_site(site_id), get_products(site_id)
    x, y, r, c = locate(s, lat, lon, x, y)
    sr, sc, disk, frac = s.disk_mask(r, c, radius_m)
    sel = lambda a: a[sr, sc][disk]
    slope, rough = sel(p["slope"]), sel(p["roughness"])
    se = sel(s.layers["slperr"]) if "slperr" in s.layers else None
    haz = ta.classify_hazard(slope, rough, se, t)
    fr = {ta.HAZ_LABELS[k]: float((haz == k).mean()) for k in ta.HAZ_LABELS}
    nz = lambda a: _f(np.nanmean(a)) if a.size and np.isfinite(a).any() else None
    nm = lambda a: _f(np.nanmax(a)) if a.size and np.isfinite(a).any() else None
    notes = []
    if frac < 1.0:
        notes.append(f"Only {frac:.0%} of the requested disk lies inside the DEM; statistics cover that part only.")
    if "ldec" not in s.layers:
        notes.append("No LOLA count layer loaded, so data fill cannot be assessed.")
    notes.append("Slope uses a 3x3 window (about 10 m); surface is interpolated where pixels have no LOLA return.")
    ld = sel(s.layers["ldec"]) if "ldec" in s.layers else None
    la, lo = dem.xy_to_latlon(x, y)
    return AreaSummary(center_lat=la, center_lon_east=lo, radius_m=radius_m, coverage_fraction=frac, n_pixels=int(disk.sum()),
                       elevation_mean_m=nz(sel(s.layers["surf"])), slope_mean_deg=nz(slope),
                       slope_p95_deg=_f(np.nanpercentile(slope, 95)) if np.isfinite(slope).any() else None, slope_max_deg=nm(slope),
                       roughness_mean_m=nz(rough), roughness_max_m=nm(rough), hazard_fractions=fr,
                       pixels_with_lola_return_fraction=None if ld is None else float(np.nanmean(ld >= 1)),
                       total_z_uncertainty_mean_m=nz(sel(s.layers["toterr"])) if "toterr" in s.layers else None,
                       slope_uncertainty_mean_deg=nz(se) if se is not None else None, notes=notes)


def horizon(site_id: str, observer_height_m: float, az_step_deg: float, max_range_m: float, curvature: bool,
            lat=None, lon=None, x=None, y=None) -> HorizonResponse:
    s = get_site(site_id)
    x, y, _, _ = locate(s, lat, lon, x, y)
    p = ha.horizon_profile(s, x, y, observer_height_m, az_step_deg, max_range_m, curvature=curvature)
    h = p.horizon_deg
    fin = np.isfinite(h)
    lst = lambda a: [None if not np.isfinite(v) else round(float(v), 4) for v in a]
    notes = ["Azimuth is true lunar azimuth (clockwise from local north), converted from the grid using the observer's longitude.",
             "Horizon elevation is measured above the observer's local horizontal on a sphere of radius 1737.4 km."]
    if p.incomplete.any():
        notes.append(f"{p.incomplete.mean():.0%} of directions run out of DEM data before {p.max_range_m:.0f} m. "
                     "In those directions the true horizon may be higher than shown, because terrain beyond the tile is unknown.")
    return HorizonResponse(
        site_id=site_id, latitude=p.latitude, longitude_east=p.longitude_east, x_m=p.x_m, y_m=p.y_m,
        ground_elevation_m=p.ground_elevation_m, observer_height_m=p.observer_height_m,
        azimuth_true_deg=[float(a) for a in p.azimuth_true_deg], horizon_deg=lst(h), horizon_distance_m=lst(p.horizon_distance_m),
        ray_length_m=[float(v) for v in p.ray_length_m], incomplete=[bool(v) for v in p.incomplete],
        max_horizon_deg=float(np.nanmax(h)) if fin.any() else None,
        max_horizon_azimuth_deg=float(p.azimuth_true_deg[np.nanargmax(h)]) if fin.any() else None,
        mean_horizon_deg=float(np.nanmean(h)) if fin.any() else None, incomplete_fraction=float(p.incomplete.mean()),
        max_range_m=p.max_range_m, step_m=p.step_m, model="sphere" if curvature else "flat-plane (for comparison only)", notes=notes)


# ---- rendering ---------------------------------------------------------------------------------
_VIRIDIS = [(0.0, (68, 1, 84)), (0.25, (59, 82, 139)), (0.5, (33, 145, 140)), (0.75, (94, 201, 98)), (1.0, (253, 231, 37))]
_HEAT = [(0.0, (12, 20, 48)), (0.35, (76, 201, 240)), (0.65, (242, 169, 59)), (1.0, (240, 113, 120))]
HAZARD_COLORS = {ta.HAZ_INSUFFICIENT: (90, 100, 125), ta.HAZ_FAVORABLE: (111, 214, 160), ta.HAZ_CAUTION: (242, 169, 59), ta.HAZ_HIGH: (240, 113, 120)}


def _cmap(v: np.ndarray, stops) -> np.ndarray:
    pos = [s[0] for s in stops]
    return np.stack([np.interp(v, pos, [s[1][k] for s in stops]) for k in range(3)], -1)


def _scaled(a: np.ndarray, lo=None, hi=None) -> tuple[np.ndarray, float, float]:
    fin = a[np.isfinite(a)]
    lo = float(np.percentile(fin, 2)) if lo is None and fin.size else lo
    hi = float(np.percentile(fin, 98)) if hi is None and fin.size else hi
    return np.clip((a - lo) / max(hi - lo, 1e-9), 0, 1), lo, hi


def layer_range(site_id: str, layer: str) -> dict:
    """Value range used for colour scaling, so the UI can draw an honest legend."""
    s, p = get_site(site_id), get_products(site_id)
    src = {"elevation": s.layers["surf"], "slope": p["slope"], "roughness": p["roughness"], "hillshade": p["hillshade"],
           "lola_count": s.layers.get("ldec"), "z_uncertainty": s.layers.get("toterr")}.get(layer)
    if src is None:
        return {}
    _, lo, hi = _scaled(src, 0, 1) if layer == "hillshade" else _scaled(src, 0.0, 15.0) if layer == "slope" else _scaled(src)
    return {"min": lo, "max": hi}


def mesh_grid(site_id: str, max_dim: int = 160) -> dict:
    """Downsampled elevation grid for the 3D view. Heights are metres; x/y are DEM grid metres."""
    if not (32 <= max_dim <= 512):
        raise ValueError("max_dim must be between 32 and 512.")
    s = get_site(site_id)
    z = s.layers["surf"]
    step = max(1, int(np.ceil(max(z.shape) / max_dim)))
    sub = z[::step, ::step]
    # Pixel-centre coordinates of the kept samples (same convention as SiteDEM.rowcol_to_xy).
    rows = np.arange(0, z.shape[0], step)
    cols = np.arange(0, z.shape[1], step)
    # transform maps pixel corners; centres are +0.5
    xs = s.transform.c + (cols + 0.5) * s.transform.a
    ys = s.transform.f + (rows + 0.5) * s.transform.e
    fin = sub[np.isfinite(sub)]
    return {
        "site_id": site_id,
        "nx": int(sub.shape[1]),
        "ny": int(sub.shape[0]),
        "step_px": step,
        "spacing_m": float(s.pixel_size_m * step),
        "x_m": [float(v) for v in xs],
        "y_m": [float(v) for v in ys],
        "z_m": [None if not np.isfinite(v) else round(float(v), 2) for v in sub.ravel()],
        "z_min_m": float(fin.min()) if fin.size else None,
        "z_max_m": float(fin.max()) if fin.size else None,
        "z_mean_m": float(fin.mean()) if fin.size else None,
        "bounds_xy_m": s.bounds_xy,
        "notes": [
            f"Downsampled {step}× from the 5 m LOLA surface (every {step}th pixel). Fine crater rims smaller than "
            f"{s.pixel_size_m * step:g} m are not resolved in this mesh.",
            "Vertical scale in the viewer is exaggerated for readability; the true heights are in metres above the DEM sphere.",
        ],
    }


def render_layer(site_id: str, layer: str, max_px: int, t: ta.HazardThresholds) -> bytes:
    s, p = get_site(site_id), get_products(site_id)
    if layer == "hazard":
        cat = hazard_map(site_id, t)
        rgba = np.zeros((*cat.shape, 4), "uint8")
        for k, col in HAZARD_COLORS.items():
            rgba[cat == k, :3] = col
        rgba[..., 3] = 255
    else:
        src = {"elevation": s.layers["surf"], "slope": p["slope"], "hillshade": p["hillshade"], "roughness": p["roughness"],
               "lola_count": s.layers.get("ldec"), "z_uncertainty": s.layers.get("toterr")}.get(layer)
        if src is None:
            raise KeyError(layer)
        if layer == "hillshade":
            v = np.nan_to_num(src, nan=0.0)
            rgb = np.stack([v * 255] * 3, -1)
        else:
            lo, hi = (0.0, 15.0) if layer == "slope" else (None, None)
            norm, _, _ = _scaled(src, lo, hi)
            rgb = _cmap(np.nan_to_num(norm), _VIRIDIS if layer == "elevation" else _HEAT)
        rgba = np.dstack([rgb.astype("uint8"), np.where(np.isfinite(src), 255, 0).astype("uint8")])
    step = max(1, int(np.ceil(max(rgba.shape[:2]) / max_px)))
    buf = io.BytesIO()
    Image.fromarray(rgba[::step, ::step], "RGBA").save(buf, "PNG", optimize=False, compress_level=3)
    return buf.getvalue()
