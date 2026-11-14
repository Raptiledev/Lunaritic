"""Loading and geolocating LOLA 5 m/pix site DEMs (Phase 2).

Facts used here come from the PGDA README (core2.gsfc.nasa.gov/PGDA/LOLA_5mpp/README) and from the
GeoTIFF metadata of the downloaded files:
  * south polar stereographic X/Y in metres, MOON_ME frame (DE421 ephemeris)
  * lunar reference sphere radius 1737.4 km (in the files' CRS)
  * latitude of origin -90, central meridian 0, no scale factor given (=> true scale at the pole)
  * pixel-registered grids; surf = height Z (m), ldec = LOLA return count, toterr = total Z RMS error (m),
    slperr = slope RMS error (deg), slp = slope (deg, optional here).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from pyproj import CRS, Transformer

MOON_RADIUS_M = 1737400.0
# Equivalent to the CRS stored in the files, written explicitly so it is documented and testable.
POLAR_STEREO_PROJ = f"+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R={MOON_RADIUS_M} +units=m +no_defs"
MOON_GEOG_PROJ = f"+proj=longlat +R={MOON_RADIUS_M} +no_defs"

REQUIRED_LAYERS = ("surf",)
OPTIONAL_LAYERS = ("ldec", "toterr", "slperr", "slp")


class DEMError(Exception):
    """Raised when a DEM is missing, inconsistent or not in the expected reference frame."""


@lru_cache(maxsize=1)
def _transformers() -> tuple[Transformer, Transformer]:
    geog, proj = CRS.from_proj4(MOON_GEOG_PROJ), CRS.from_proj4(POLAR_STEREO_PROJ)
    return (Transformer.from_crs(geog, proj, always_xy=True), Transformer.from_crs(proj, geog, always_xy=True))


def latlon_to_xy(lat: float, lon_east: float) -> tuple[float, float]:
    """Selenographic latitude / east-positive longitude (deg) -> polar stereographic metres."""
    x, y = _transformers()[0].transform(lon_east, lat)
    return float(x), float(y)


def xy_to_latlon(x: float, y: float) -> tuple[float, float]:
    """Polar stereographic metres -> (latitude, east longitude in 0..360)."""
    lon, lat = _transformers()[1].transform(x, y)
    return float(lat), float(lon % 360.0)


def _check_crs(wkt: str | None, name: str) -> None:
    if not wkt or "Polar_Stereographic" not in wkt or "1737400" not in wkt.replace(" ", "") or '"latitude_of_origin",-90' not in wkt:
        raise DEMError(f"{name}: CRS is not the expected south polar stereographic on a 1737.4 km sphere; refusing to use it.")


@dataclass
class SiteDEM:
    site_id: str
    transform: Affine
    shape: tuple[int, int]
    pixel_size_m: float
    layers: dict[str, np.ndarray]
    files: dict[str, str] = field(default_factory=dict)

    # ---- geometry -------------------------------------------------------------------------------
    @property
    def bounds_xy(self) -> tuple[float, float, float, float]:
        """(xmin, ymin, xmax, ymax) of the grid edges, metres."""
        h, w = self.shape
        x0, y0 = self.transform @ (0, 0)
        x1, y1 = self.transform @ (w, h)
        return (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))

    def xy_to_rowcol(self, x: float, y: float) -> tuple[int, int] | None:
        col, row = ~self.transform @ (x, y)
        r, c = int(np.floor(row)), int(np.floor(col))
        if 0 <= r < self.shape[0] and 0 <= c < self.shape[1]:
            return r, c
        return None

    def rowcol_to_xy(self, row: float, col: float) -> tuple[float, float]:
        """Centre of pixel (row, col)."""
        x, y = self.transform @ (col + 0.5, row + 0.5)
        return float(x), float(y)

    def latlon_to_rowcol(self, lat: float, lon: float) -> tuple[int, int] | None:
        return self.xy_to_rowcol(*latlon_to_xy(lat, lon))

    def extent_latlon(self) -> dict:
        xmin, ymin, xmax, ymax = self.bounds_xy
        corners = [(xmin, ymin), (xmin, ymax), (xmax, ymin), (xmax, ymax)]
        ll = [xy_to_latlon(x, y) for x, y in corners]
        lats = [p[0] for p in ll]
        return {"lat_min": min(lats), "lat_max": max(lats), "corners_lat_lon_east": ll}

    def disk_mask(self, row: int, col: int, radius_m: float) -> tuple[slice, slice, np.ndarray, float]:
        """Window slices, boolean disk mask inside the window, and fraction of the disk inside the grid."""
        rp = int(np.ceil(radius_m / self.pixel_size_m))
        r0, r1, c0, c1 = row - rp, row + rp + 1, col - rp, col + rp + 1
        rr, cc = np.mgrid[r0:r1, c0:c1]
        disk = (np.hypot(rr - row, cc - col) * self.pixel_size_m) <= radius_m
        inside = (rr >= 0) & (rr < self.shape[0]) & (cc >= 0) & (cc < self.shape[1])
        frac = float((disk & inside).sum() / max(disk.sum(), 1))
        sl_r, sl_c = slice(max(r0, 0), min(r1, self.shape[0])), slice(max(c0, 0), min(c1, self.shape[1]))
        sub = disk[(sl_r.start - r0):(sl_r.stop - r0), (sl_c.start - c0):(sl_c.stop - c0)]
        return sl_r, sl_c, sub, frac


def _read_layer(path: Path) -> tuple[np.ndarray, Affine, str | None, float]:
    with rasterio.open(path) as ds:
        if ds.count != 1:
            raise DEMError(f"{path.name}: expected 1 band, found {ds.count}.")
        _check_crs(ds.crs.to_wkt() if ds.crs else None, path.name)
        if abs(abs(ds.res[0]) - abs(ds.res[1])) > 1e-9:
            raise DEMError(f"{path.name}: non-square pixels {ds.res}.")
        arr = ds.read(1).astype("float32")
        if ds.nodata is not None and not np.isnan(ds.nodata):
            arr[arr == ds.nodata] = np.nan
        return arr, ds.transform, ds.crs.to_wkt(), float(abs(ds.res[0]))


def list_site_ids(dem_dir: Path) -> list[str]:
    return sorted(p.name.split("_")[0].lower() for p in dem_dir.glob("*_surf.tif"))


def load_site(dem_dir: Path, site_id: str, surf_only: bool = False) -> SiteDEM:
    """Load all available layers of one site and verify they share one grid."""
    prefix = site_id[0].upper() + site_id[1:]
    wanted = REQUIRED_LAYERS if surf_only else (*REQUIRED_LAYERS, *OPTIONAL_LAYERS)
    found = {l: p for l in wanted if (p := next(dem_dir.glob(f"{prefix}_*_{l}.tif"), None))}
    for l in REQUIRED_LAYERS:
        if l not in found:
            raise DEMError(f"No '{l}' GeoTIFF found for {site_id} in {dem_dir}.")
    surf, ref_tf, _, px = _read_layer(found["surf"])
    layers: dict[str, np.ndarray] = {"surf": surf}
    for name, path in found.items():
        if name == "surf":
            continue
        arr, tf, _, _ = _read_layer(path)
        if arr.shape != surf.shape or tf != ref_tf:
            raise DEMError(f"{path.name}: grid does not match the surf layer (shape or geotransform differs).")
        layers[name] = arr
    return SiteDEM(site_id=site_id, transform=ref_tf, shape=surf.shape, pixel_size_m=px,
                   layers=layers, files={k: v.name for k, v in found.items()})
