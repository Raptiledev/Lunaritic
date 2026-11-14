"""Fetch published NASA / JPL products into the runtime cache.

The Next.js app does not bundle these files. On first use the API downloads them from the
public URLs below into ``settings.data_dir`` (gitignored). Later requests reuse that cache.
Set ``LUNARIS_REMOTE_DATA=0`` to require files that are already on disk.
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from app.core.config import settings

log = logging.getLogger("lunaris.remote")

_NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
_SITE = "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01"

# Direct file URLs. The PGDA landing page is not itself a GeoTIFF.
KERNEL_URLS: dict[str, str] = {
    "naif0012.tls": f"{_NAIF}/lsk/naif0012.tls",
    "pck00011.tpc": f"{_NAIF}/pck/pck00011.tpc",
    "moon_080317.tf": f"{_NAIF}/fk/satellites/moon_080317.tf",
    "moon_assoc_me.tf": f"{_NAIF}/fk/satellites/moon_assoc_me.tf",
    "moon_pa_de421_1900-2050.bpc": f"{_NAIF}/pck/moon_pa_de421_1900-2050.bpc",
    "de421.bsp": f"{_NAIF}/spk/planets/a_old_versions/de421.bsp",
}
SITE_URLS: dict[str, str] = {
    "Site01_final_adj_5mpp_surf.tif": f"{_SITE}/Site01_final_adj_5mpp_surf.tif",
    "Site01_final_adj_5mpp_ldec.tif": f"{_SITE}/Site01_final_adj_5mpp_ldec.tif",
    "Site01_final_adj_5mpp_toterr.tif": f"{_SITE}/Site01_final_adj_5mpp_toterr.tif",
    "Site01_final_adj_5mpp_slperr.tif": f"{_SITE}/Site01_final_adj_5mpp_slperr.tif",
    "Site01_final_adj_5mpp_slp.tif": f"{_SITE}/Site01_final_adj_5mpp_slp.tif",
}

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


class RemoteDataError(Exception):
    """A public NASA/JPL file could not be downloaded."""


def remote_url_for(filename: str) -> str | None:
    return KERNEL_URLS.get(filename) or SITE_URLS.get(filename)


def _file_lock(key: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(key, threading.Lock())


def _download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    timeout = httpx.Timeout(30.0, read=300.0)
    log.info("Fetching %s", url)
    try:
        with httpx.stream("GET", url, follow_redirects=True, timeout=timeout) as res:
            res.raise_for_status()
            # SPICE text kernels (.tls/.tf/.tpc) are served as text/plain. Only HTML
            # usually means an interstitial/error page instead of the kernel or DEM.
            kind = (res.headers.get("content-type") or "").split(";")[0].strip().lower()
            if kind in {"text/html", "application/xhtml+xml"}:
                raise RemoteDataError(f"{url} returned {kind}, not the data file.")
            expected = int(res.headers.get("content-length") or 0)
            with tmp.open("wb") as out:
                for chunk in res.iter_bytes(256 * 1024):
                    out.write(chunk)
    except RemoteDataError:
        tmp.unlink(missing_ok=True)
        raise
    except httpx.HTTPError as e:
        tmp.unlink(missing_ok=True)
        raise RemoteDataError(f"Download failed for {url}: {e}") from e
    got = tmp.stat().st_size
    if expected and got != expected:
        tmp.unlink(missing_ok=True)
        raise RemoteDataError(f"{url} was truncated ({got} of {expected} bytes).")
    if got < 1024:
        tmp.unlink(missing_ok=True)
        raise RemoteDataError(f"{url} was only {got} bytes.")
    tmp.replace(dest)
    log.info("Cached %s (%d bytes)", dest.name, got)


def ensure_files(folder: Path, urls: dict[str, str]) -> None:
    """Download any missing files. Files already on disk are left untouched."""
    if not settings.remote_data:
        return
    missing = [(name, url) for name, url in urls.items() if not (folder / name).is_file()]
    if not missing:
        return

    def one(item: tuple[str, str]) -> None:
        name, url = item
        dest = folder / name
        with _file_lock(str(dest)):
            if dest.is_file():
                return
            _download(url, dest)

    with ThreadPoolExecutor(max_workers=min(3, len(missing))) as pool:
        list(pool.map(one, missing))


def ensure_kernels() -> None:
    ensure_files(settings.kernel_dir, KERNEL_URLS)


def ensure_site_dems() -> None:
    ensure_files(settings.dem_dir, SITE_URLS)
