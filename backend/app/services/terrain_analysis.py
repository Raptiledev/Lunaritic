"""Terrain derivatives and hazard classification on a metre-based polar stereographic grid.

Scale note: for a polar stereographic projection with true scale at the pole, the local scale factor is
k ~ 1 + (r / 2R)^2. For this product (r < ~30 km, R = 1737.4 km) that is < 1.0001, so a 5 m pixel is 5 m on the
ground to within 0.01 % and slopes can be computed directly on the grid. For larger areas this would not hold.

Aspect and gradients are relative to GRID north (+y of the projection), not true lunar north. The angle between
them depends on longitude; Phase 3/4 must convert before comparing with Sun/Earth azimuths.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage as ndi

HAZ_INSUFFICIENT, HAZ_FAVORABLE, HAZ_CAUTION, HAZ_HIGH = 0, 1, 2, 3
HAZ_LABELS = {HAZ_INSUFFICIENT: "Insufficient data", HAZ_FAVORABLE: "Favorable", HAZ_CAUTION: "Caution", HAZ_HIGH: "High risk"}


@dataclass(frozen=True)
class HazardThresholds:
    """Illustrative, user-configurable defaults. NOT NASA mission requirements."""
    slope_caution_deg: float = 5.0
    slope_high_deg: float = 10.0
    roughness_caution_m: float = 0.25
    roughness_high_m: float = 0.50
    max_slope_uncertainty_deg: float = 5.0  # above this the slope is too uncertain to classify


def gradients(z: np.ndarray, dx: float) -> tuple[np.ndarray, np.ndarray]:
    """Horn (1981) 3x3 gradients in map axes: dz/dx (towards +x) and dz/dy (towards +y = up in the image).

    Border pixels are NaN. NaNs in the 3x3 neighbourhood, or at the pixel itself, propagate to the result.
    """
    z = z.astype("float64", copy=False)
    a, b, c = z[:-2, :-2], z[:-2, 1:-1], z[:-2, 2:]
    d, f = z[1:-1, :-2], z[1:-1, 2:]
    g, h, i = z[2:, :-2], z[2:, 1:-1], z[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * dx)
    dzdy = ((a + 2 * b + c) - (g + 2 * h + i)) / (8 * dx)  # image row 0 is the largest y
    out_x = np.full(z.shape, np.nan); out_y = np.full(z.shape, np.nan)
    out_x[1:-1, 1:-1], out_y[1:-1, 1:-1] = dzdx, dzdy
    out_x[np.isnan(z)] = out_y[np.isnan(z)] = np.nan  # no derivative where the height itself is missing
    return out_x, out_y


def slope_aspect(z: np.ndarray, dx: float) -> tuple[np.ndarray, np.ndarray]:
    """Slope (deg) and aspect (deg clockwise from grid north of the DOWNSLOPE direction; NaN where flat)."""
    dzdx, dzdy = gradients(z, dx)
    slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    aspect = np.degrees(np.arctan2(-dzdx, -dzdy)) % 360.0
    aspect[np.hypot(dzdx, dzdy) < 1e-12] = np.nan
    return slope.astype("float32"), aspect.astype("float32")


def hillshade(z: np.ndarray, dx: float, azimuth_deg: float = 315.0, altitude_deg: float = 45.0) -> np.ndarray:
    """Cartographic hillshade in 0..1. A display aid only; it is NOT the physical solar illumination."""
    dzdx, dzdy = gradients(z, dx)
    norm = np.sqrt(dzdx**2 + dzdy**2 + 1.0)
    az, alt = np.radians(azimuth_deg), np.radians(altitude_deg)
    light = (np.sin(az) * np.cos(alt), np.cos(az) * np.cos(alt), np.sin(alt))
    shade = (-dzdx * light[0] - dzdy * light[1] + light[2]) / norm
    return np.clip(shade, 0.0, 1.0).astype("float32")


def _edge_mask(shape: tuple[int, int], half: int) -> np.ndarray:
    m = np.zeros(shape, bool)
    m[:half, :] = m[-half:, :] = m[:, :half] = m[:, -half:] = True
    return m


def local_relief(z: np.ndarray, window: int = 11) -> np.ndarray:
    """Max minus min elevation in a square window (m). Includes the regional slope, so it is not a roughness metric."""
    bad = ndi.maximum_filter(np.isnan(z).astype("uint8"), size=window).astype(bool) | _edge_mask(z.shape, window // 2)
    zmax = ndi.maximum_filter(np.where(np.isnan(z), -np.inf, z), size=window)
    zmin = ndi.minimum_filter(np.where(np.isnan(z), np.inf, z), size=window)
    out = (zmax - zmin).astype("float32")
    out[bad] = np.nan
    return out


def roughness(z: np.ndarray, window: int = 5) -> np.ndarray:
    """RMS height residual (m) from the best-fit plane in a square window (odd size, in pixels).

    Removing the plane means a smooth slope has ~0 roughness, unlike a plain standard deviation. For a centred square
    window the x and y plane terms are orthogonal, so residual variance = var(z) - cov(x,z)^2/var(x) - cov(y,z)^2/var(y).
    """
    if window % 2 == 0 or window < 3:
        raise ValueError("window must be an odd integer >= 3")
    z64 = z.astype("float64")
    xs = np.arange(window) - (window - 1) / 2.0
    var_x = float(np.mean(xs**2))
    mean_z = ndi.uniform_filter(z64, window, mode="nearest")
    var_z = ndi.uniform_filter(z64 * z64, window, mode="nearest") - mean_z**2
    cov_xz = ndi.correlate1d(ndi.uniform_filter1d(z64, window, axis=0, mode="nearest"), xs / window, axis=1, mode="nearest")
    cov_yz = ndi.correlate1d(ndi.uniform_filter1d(z64, window, axis=1, mode="nearest"), xs / window, axis=0, mode="nearest")
    resid = var_z - (cov_xz**2 + cov_yz**2) / var_x
    out = np.sqrt(np.clip(resid, 0.0, None)).astype("float32")
    out[_edge_mask(z.shape, window // 2)] = np.nan
    out[np.isnan(mean_z)] = np.nan
    return out


def classify_hazard(slope: np.ndarray, rough: np.ndarray, slope_err: np.ndarray | None, t: HazardThresholds = HazardThresholds()) -> np.ndarray:
    """Per-pixel category from the WORST of the slope and roughness criteria.

    Limitations: slope is computed over ~10 m (3x3 pixels of 5 m), not lander-footprint scale; craters, rims and
    boulders are not detected, so a crater is not labelled hazardous merely for being a depression; pixels filled by
    interpolation (ldec = 0) carry more uncertainty than the classification reflects.
    """
    cat = np.full(slope.shape, HAZ_FAVORABLE, dtype="uint8")
    cat[(slope >= t.slope_caution_deg) | (rough >= t.roughness_caution_m)] = HAZ_CAUTION
    cat[(slope >= t.slope_high_deg) | (rough >= t.roughness_high_m)] = HAZ_HIGH
    insufficient = np.isnan(slope) | np.isnan(rough)
    if slope_err is not None:
        insufficient |= np.isnan(slope_err) | (slope_err > t.max_slope_uncertainty_deg)
    cat[insufficient] = HAZ_INSUFFICIENT
    return cat
