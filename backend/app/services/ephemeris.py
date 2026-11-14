"""Topocentric Sun and Earth positions at a point on the Moon, from NAIF SPICE (Phase 4).

Method
------
The observer is a fixed point on the lunar sphere (R = 1737.4 km, the DEM's sphere) plus its height, expressed in the
MOON_ME frame (Mean Earth / polar axis, DE421 realisation; moon_080317.tf + moon_pa_de421_1900-2050.bpc). That is the
frame of the LOLA DEM, so DEM coordinates can be used directly.

spkcpo() gives the apparent vector from that observer to the Sun or Earth (light time + stellar aberration, 'LT+S';
the Moon has no atmosphere, so no refraction). The vector is rotated into local East/North/Up where Up is the sphere
normal, i.e. the same local horizontal that the terrain horizon engine uses, so elevations are directly comparable.

    azimuth   = atan2(E, N)  clockwise from local north (towards the lunar north pole), 0..360
    elevation = asin(U / |v|)

Apparent angular radius uses the nominal radii below. The disk centre, not its limb, is what `elevation_deg` gives.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from app.services.dem_service import MOON_RADIUS_M

KERNELS = ("naif0012.tls", "pck00011.tpc", "moon_080317.tf", "moon_assoc_me.tf", "moon_pa_de421_1900-2050.bpc", "de421.bsp")
FRAME = "MOON_ME"
ABCORR = "LT+S"
BODY_RADIUS_KM = {"SUN": 695700.0, "EARTH": 6378.137}   # IAU 2015 nominal solar radius; WGS84 equatorial radius
MAX_SAMPLES = 50000

_lock = threading.Lock()   # CSPICE is not thread-safe; FastAPI runs sync endpoints in a thread pool.
_loaded: list[str] = []


class EphemerisUnavailable(Exception):
    """Kernels are missing or SPICE is not installed."""


def kernel_status(kernel_dir: Path) -> dict:
    present = {k: (kernel_dir / k).is_file() for k in KERNELS}
    return {"kernel_dir": str(kernel_dir), "kernels": present, "ready": all(present.values()), "loaded": list(_loaded),
            "frame": FRAME, "aberration_correction": ABCORR}


def _ensure_loaded(kernel_dir: Path):
    try:
        import spiceypy as sp
    except ImportError as e:
        raise EphemerisUnavailable("spiceypy is not installed (pip install -r requirements.txt).") from e
    if _loaded:
        return sp
    from app.core.config import settings
    from app.services.remote_data import RemoteDataError, ensure_kernels
    if settings.remote_data and kernel_dir.resolve() == settings.kernel_dir.resolve():
        try:
            ensure_kernels()
        except RemoteDataError as e:
            raise EphemerisUnavailable(str(e)) from e
    missing = [k for k in KERNELS if not (kernel_dir / k).is_file()]
    if missing:
        raise EphemerisUnavailable(
            f"Missing SPICE kernels in {kernel_dir}: {', '.join(missing)}. "
            "They are fetched from naif.jpl.nasa.gov when LUNARIS_REMOTE_DATA=1."
        )
    for k in KERNELS:
        sp.furnsh(str(kernel_dir / k))
        _loaded.append(k)
    return sp


def surface_vector_km(lat_deg: float, lon_east_deg: float, height_m: float, radius_m: float = MOON_RADIUS_M) -> np.ndarray:
    """Body-fixed (MOON_ME) position of a point at `height_m` above the reference sphere, in km."""
    la, lo = np.radians(lat_deg), np.radians(lon_east_deg)
    r = (radius_m + height_m) / 1000.0
    return r * np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])


def enu_basis(lat_deg: float, lon_east_deg: float) -> np.ndarray:
    """Rows are unit East, North, Up in MOON_ME for the sphere normal at (lat, lon)."""
    la, lo = np.radians(lat_deg), np.radians(lon_east_deg)
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    return np.vstack([east, north, up])


def parse_utc(s: str) -> datetime:
    t = datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
    return (t if t.tzinfo else t.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


@dataclass
class Track:
    body: str
    times_utc: list[str]
    azimuth_deg: np.ndarray
    elevation_deg: np.ndarray
    distance_km: np.ndarray
    angular_radius_deg: np.ndarray


def epochs(start: datetime, stop: datetime, step: timedelta) -> list[datetime]:
    if stop < start:
        raise ValueError("stop must not be before start.")
    if step.total_seconds() <= 0:
        raise ValueError("step must be positive.")
    n = int((stop - start) / step) + 1
    if n > MAX_SAMPLES:
        raise ValueError(f"{n} samples requested; the limit is {MAX_SAMPLES}. Use a larger step.")
    return [start + i * step for i in range(n)]


def body_vectors(kernel_dir: Path, obs_km: np.ndarray, times: list[datetime], bodies: tuple[str, ...]) -> dict[str, np.ndarray]:
    """Apparent observer->body vectors (n, 3) in MOON_ME, km, for a fixed body-fixed observer."""
    out = {}
    with _lock:
        sp = _ensure_loaded(kernel_dir)
        # UTC -> ET is not linear across leap seconds, so each epoch is converted rather than offset from the first.
        ets = [sp.str2et(t.strftime("%Y-%m-%d %H:%M:%S.%f") + " UTC") for t in times]
        for body in bodies:
            v = np.empty((len(ets), 3))
            for i, et in enumerate(ets):
                state, _ = sp.spkcpo(body, et, FRAME, "OBSERVER", ABCORR, obs_km, "MOON", FRAME)
                v[i] = state[:3]
            out[body] = v
    return out


def tracks(kernel_dir: Path, lat: float, lon_east: float, height_m: float, start: datetime, stop: datetime,
           step: timedelta, bodies: tuple[str, ...] = ("SUN", "EARTH")) -> list[Track]:
    times = epochs(start, stop, step)
    if abs(lat) > 89.9999:
        raise ValueError("Azimuth is undefined exactly at the pole; move the point slightly.")
    basis = enu_basis(lat, lon_east)
    vectors = body_vectors(kernel_dir, surface_vector_km(lat, lon_east, height_m), times, bodies)
    out = []
    for body in bodies:
        v = vectors[body]
        enu = v @ basis.T
        dist = np.linalg.norm(v, axis=1)
        az = np.degrees(np.arctan2(enu[:, 0], enu[:, 1])) % 360.0
        el = np.degrees(np.arcsin(enu[:, 2] / dist))
        rad = np.degrees(np.arcsin(BODY_RADIUS_KM[body] / dist))
        out.append(Track(body, [t.strftime("%Y-%m-%dT%H:%M:%SZ") for t in times], az, el, dist, rad))
    return out
