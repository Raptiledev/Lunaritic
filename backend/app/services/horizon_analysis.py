"""Terrain horizon profile around an observer (Phase 3).

Method
------
For each true azimuth A (degrees clockwise from local lunar north) a ray is sampled outward over the DEM in steps of
`step_m`. For each sample at ground distance s with height z, the elevation angle above the observer's LOCAL horizontal
plane is computed on a sphere of radius R (exact, not flat-plane):

    r0 = R + z_obs,  r1 = R + z,  theta = s / R
    elevation = atan2( r1 cos(theta) - r0 ,  r1 sin(theta) )

The horizon elevation at A is the maximum over all samples. The sphere term reproduces the curvature drop
(about s^2 / 2R) and the dip of the horizon for an elevated observer.

Reference frame
---------------
The DEM grid is south polar stereographic. A true azimuth A at an observer of east longitude lon corresponds to grid
azimuth (clockwise from the grid +y axis) = A + lon. This was verified numerically against great-circle destinations
(see tests). Elevations are heights on the 1737.4 km sphere of the DEM's CRS; their vertical reference is not yet
confirmed (see datasets.json), so absolute heights carry that caveat.

Limits (reported, not hidden)
-----------------------------
* The horizon is only as far as the DEM extends. A ray that leaves the data (or hits a gap) before `max_range_m` is
  flagged `incomplete`; its horizon is a LOWER BOUND, because higher terrain may lie beyond the tile.
* Grid distance is used as ground distance. The projection scale error is ~(rho/2R)^2 < 1e-4 here.
* Heights between samples use bilinear interpolation of a surface that is mostly interpolated from sparse LOLA returns.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage as ndi

from app.services.dem_service import MOON_RADIUS_M, SiteDEM, xy_to_latlon


def true_to_grid_azimuth(az_true_deg: np.ndarray | float, lon_east_deg: float) -> np.ndarray | float:
    return (np.asarray(az_true_deg) + lon_east_deg) % 360.0


@dataclass
class HorizonProfile:
    x_m: float
    y_m: float
    latitude: float
    longitude_east: float
    ground_elevation_m: float
    observer_height_m: float
    azimuth_true_deg: np.ndarray       # (n_az,) clockwise from local true north
    horizon_deg: np.ndarray            # (n_az,) elevation of the terrain horizon; NaN if no valid samples
    horizon_distance_m: np.ndarray     # (n_az,) distance of the limiting terrain point
    ray_length_m: np.ndarray           # (n_az,) distance with valid data along the ray
    incomplete: np.ndarray             # (n_az,) bool: data ended before max_range_m (horizon is a lower bound)
    max_range_m: float
    step_m: float
    curvature: bool
    radius_m: float


def _bilinear(layer: np.ndarray, site: SiteDEM, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    col, row = ~site.transform @ (x, y)
    # transform maps pixel CORNERS; array indices refer to pixel centres, hence the half-pixel shift.
    return ndi.map_coordinates(layer, [row - 0.5, col - 0.5], order=1, mode="constant", cval=np.nan)


def horizon_profile(site: SiteDEM, x: float, y: float, observer_height_m: float = 0.0, az_step_deg: float = 1.0,
                    max_range_m: float = 20000.0, step_m: float | None = None, curvature: bool = True,
                    radius_m: float = MOON_RADIUS_M) -> HorizonProfile:
    if not (0.05 <= az_step_deg <= 30):
        raise ValueError("az_step_deg must be between 0.05 and 30.")
    if max_range_m <= 0 or observer_height_m < 0:
        raise ValueError("max_range_m must be positive and observer_height_m must not be negative.")
    step = float(step_m or site.pixel_size_m)
    z_ground = float(_bilinear(site.layers["surf"], site, np.array([x]), np.array([y]))[0])
    if not np.isfinite(z_ground):
        raise ValueError("Observer location has no valid elevation (outside the DEM or in a data gap).")
    lat, lon = xy_to_latlon(x, y)
    z_obs = z_ground + observer_height_m

    az_true = np.arange(0.0, 360.0, az_step_deg)
    grid_az = np.radians(true_to_grid_azimuth(az_true, lon))
    s = np.arange(step, max_range_m + step / 2, step)                       # (n_s,)
    xs = x + np.outer(np.sin(grid_az), s)
    ys = y + np.outer(np.cos(grid_az), s)
    z = _bilinear(site.layers["surf"], site, xs, ys)                         # (n_az, n_s)

    valid = np.logical_and.accumulate(np.isfinite(z), axis=1)                # valid prefix of each ray
    if curvature:
        r0, r1, th = radius_m + z_obs, radius_m + np.where(valid, z, 0.0), s / radius_m
        ang = np.degrees(np.arctan2(r1 * np.cos(th) - r0, r1 * np.sin(th)))
    else:
        ang = np.degrees(np.arctan2(np.where(valid, z, 0.0) - z_obs, s))
    ang = np.where(valid, ang, -np.inf)
    idx = ang.argmax(axis=1)
    best = ang[np.arange(len(az_true)), idx]
    has_data = np.isfinite(best)
    n_valid = valid.sum(axis=1)
    return HorizonProfile(
        x_m=x, y_m=y, latitude=lat, longitude_east=lon, ground_elevation_m=z_ground, observer_height_m=observer_height_m,
        azimuth_true_deg=az_true, horizon_deg=np.where(has_data, best, np.nan),
        horizon_distance_m=np.where(has_data, s[idx], np.nan), ray_length_m=n_valid * step,
        incomplete=n_valid < len(s), max_range_m=float(max_range_m), step_m=step, curvature=curvature, radius_m=radius_m)


def horizon_at(profile: HorizonProfile, az_true_deg: np.ndarray | float) -> np.ndarray:
    """Horizon elevation at arbitrary azimuth (linear interpolation, periodic). NaN gaps are filled by neighbours."""
    az, h = profile.azimuth_true_deg, profile.horizon_deg
    ok = np.isfinite(h)
    if not ok.any():
        return np.full(np.shape(az_true_deg), np.nan)
    return np.interp(np.asarray(az_true_deg) % 360.0, az[ok], h[ok], period=360.0)


def disk_visible_fraction(profile: HorizonProfile, body_az_deg: float, body_el_deg: float, body_radius_deg: float, n: int = 61) -> float:
    """Fraction (0..1) of a circular disk (Sun or Earth) that is above the terrain horizon.

    The disk is cut into vertical strips; each strip's azimuth offset is the on-sky offset divided by cos(elevation).
    Used in Phase 5 for sunlight / Earth-visibility decisions with a finite apparent disk.
    """
    if body_radius_deg <= 0:
        return float(body_el_deg > horizon_at(profile, body_az_deg))
    u = np.linspace(-body_radius_deg, body_radius_deg, n)
    w = np.sqrt(np.clip(body_radius_deg**2 - u**2, 0, None))                  # half height of each strip
    daz = u / max(np.cos(np.radians(body_el_deg)), 1e-3)
    h = horizon_at(profile, body_az_deg + daz)
    top, bottom = body_el_deg + w, body_el_deg - w
    visible = np.clip(top - np.maximum(bottom, h), 0, None)
    total = (2 * w).sum()
    return float(visible.sum() / total) if total > 0 else 0.0


def disk_visible_fractions(profile: HorizonProfile, az_deg: np.ndarray, el_deg: np.ndarray, radius_deg: np.ndarray, n: int = 61) -> np.ndarray:
    """Vectorised disk_visible_fraction for many epochs at once (same strip method). Returns shape (N,)."""
    az, el, rad = (np.asarray(a, dtype=float).reshape(-1, 1) for a in (az_deg, el_deg, radius_deg))
    u = np.linspace(-1.0, 1.0, n).reshape(1, -1) * rad                        # (N, n) on-sky offsets
    w = np.sqrt(np.clip(rad**2 - u**2, 0, None))
    h = horizon_at(profile, az + u / np.maximum(np.cos(np.radians(el)), 1e-3))
    visible = np.clip(el + w - np.maximum(el - w, h), 0, None)
    total = (2 * w).sum(axis=1)
    return np.where(total > 0, visible.sum(axis=1) / np.where(total > 0, total, 1), 0.0)
