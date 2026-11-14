"""Build browser-friendly Full Moon assets from downloaded NASA/USGS products.

Inputs (expected under app/data/dem/global/):
  ldem_16.img + ldem_16.lbl          — LOLA global heights (includes poles)
  wac/Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif — WAC albedo

Outputs (app/data/cache/global_globe/):
  wac_albedo_4k.jpg     — equirectangular photo map for the sphere
  ldem_bump_2k.png      — greyscale height for bump / modest displacement
  manifest.json         — provenance + sizes

Honesty: WAC is imagery; LDEM_16 is ~1.9 km/px. Site01 5 m remains the AOI science DEM.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling

ROOT = Path(__file__).resolve().parents[1]
GLOBAL = ROOT / "app" / "data" / "dem" / "global"
WAC = GLOBAL / "wac" / "Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif"
LDEM_IMG = GLOBAL / "ldem_16.img"
LDEM_LBL = GLOBAL / "ldem_16.lbl"
OUT = ROOT / "app" / "data" / "cache" / "global_globe"


def _read_ldem16() -> np.ndarray:
    """PDS LDEM_16: 2880 lines × 5760 samples, LSB int16, height_m = DN * 0.5."""
    if not LDEM_IMG.is_file():
        raise SystemExit(f"Missing {LDEM_IMG}")
    raw = np.fromfile(LDEM_IMG, dtype="<i2")
    if raw.size != 2880 * 5760:
        raise SystemExit(f"Unexpected LDEM_16 size: {raw.size} samples (want {2880*5760})")
    h = (raw.astype(np.float32) * 0.5).reshape(2880, 5760)
    return h


def _build_bump(height: np.ndarray, width: int = 2048, height_px: int = 1024) -> Path:
    # Resize with simple box average via PIL.
    hmin, hmax = float(np.nanpercentile(height, 1)), float(np.nanpercentile(height, 99))
    norm = np.clip((height - hmin) / max(hmax - hmin, 1.0), 0, 1)
    img = Image.fromarray((norm * 255).astype(np.uint8), mode="L")
    img = img.resize((width, height_px), Image.Resampling.BILINEAR)
    path = OUT / "ldem_bump_2k.png"
    img.save(path, optimize=True)
    return path


def _build_wac(width: int = 4096, height_px: int = 2048) -> Path:
    if not WAC.is_file():
        raise SystemExit(f"Missing {WAC}")
    print(f"Reading WAC mosaic {WAC.name} ({WAC.stat().st_size / 1e9:.2f} GB) -> {width}x{height_px} ...")
    with rasterio.open(WAC) as src:
        data = src.read(
            1,
            out_shape=(height_px, width),
            resampling=Resampling.average,
        )
    # Stretch robustly for display (WAC DN / reflectance-like 8-bit mosaic).
    lo, hi = np.percentile(data[data > 0], [2, 98]) if np.any(data > 0) else (0, 255)
    stretched = np.clip((data.astype(np.float32) - lo) / max(hi - lo, 1e-6), 0, 1)
    rgb = np.stack([stretched, stretched, stretched], axis=-1)
    img = Image.fromarray((rgb * 255).astype(np.uint8), mode="RGB")
    path = OUT / "wac_albedo_4k.jpg"
    img.save(path, quality=85, optimize=True)
    return path


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    height = _read_ldem16()
    bump = _build_bump(height)
    print(f"Wrote {bump} ({bump.stat().st_size / 1e6:.1f} MB)")
    albedo = _build_wac()
    print(f"Wrote {albedo} ({albedo.stat().st_size / 1e6:.1f} MB)")
    manifest = {
        "wac_albedo": albedo.name,
        "ldem_bump": bump.name,
        "sources": {
            "wac": str(WAC.relative_to(ROOT)),
            "ldem": str(LDEM_IMG.relative_to(ROOT)),
            "ldem_note": "LOLA LDEM_16 (~1.9 km/px), heights relative to 1737.4 km sphere",
            "wac_note": "USGS LROC WAC global morphology mosaic 100 m (June 2013), downsampled for browser",
        },
        "moon_radius_m": 1737400.0,
        "honesty": [
            "Full Moon albedo is real WAC imagery, downsampled.",
            "Global relief uses LDEM_16 (~1.9 km/px), not Site01 5 m.",
            "Site01 remains the only high-resolution AOI science DEM.",
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("Done.", OUT)


if __name__ == "__main__":
    # Avoid GDAL/PROJ conflicts on this machine.
    import os
    os.environ.pop("PROJ_LIB", None)
    os.environ.pop("GDAL_DATA", None)
    main()
