"""Print real metadata for every raster in app/data/dem/ (Phase 2, step 1).

Nothing here is assumed: CRS, resolution, units, nodata and value ranges are read from the files.
Usage:  python scripts/inspect_dem.py [path_to_dir_or_file]
Writes app/data/cache/dem_inspection.json so the dataset registry can be filled from facts.
"""
import json
import sys
from pathlib import Path

import numpy as np
import rasterio

EXTS = {".tif", ".tiff", ".img", ".lbl", ".vrt", ".cub"}
DEM_DIR = Path(__file__).resolve().parents[1] / "app" / "data" / "dem"
OUT = Path(__file__).resolve().parents[1] / "app" / "data" / "cache" / "dem_inspection.json"


def find_files(target: Path) -> list[Path]:
    if target.is_file():
        return [target]
    files = [p for p in sorted(target.iterdir()) if p.suffix.lower() in EXTS or p.suffix == ""]
    # Prefer .lbl over .img when both exist (GDAL reads PDS3 via the label).
    stems_with_lbl = {p.stem for p in files if p.suffix.lower() == ".lbl"}
    return [p for p in files if not (p.suffix.lower() == ".img" and p.stem in stems_with_lbl) and p.is_file()]


def inspect(path: Path) -> dict:
    with rasterio.open(path) as ds:
        # Downsampled read keeps memory bounded on large 5 m/px tiles; stats are approximate.
        scale = max(1, max(ds.width, ds.height) // 2000)
        arr = ds.read(1, out_shape=(1, ds.height // scale, ds.width // scale), masked=True)
        valid = arr.compressed().astype("float64")
        return {
            "file": path.name,
            "driver": ds.driver,
            "size_px": [ds.width, ds.height],
            "bands": ds.count,
            "dtype": ds.dtypes[0],
            "nodata": ds.nodata,
            "crs_wkt": ds.crs.to_wkt() if ds.crs else None,
            "pixel_size": [ds.res[0], ds.res[1]],
            "bounds": list(ds.bounds),
            "transform": list(ds.transform)[:6],
            "units": ds.units[0] if ds.units else None,
            "description": ds.descriptions[0] if ds.descriptions else None,
            "tags": ds.tags(),
            "band_tags": ds.tags(1),
            "stats_approx": {
                "downsample_factor": scale,
                "valid_fraction": float(valid.size / arr.size) if arr.size else 0.0,
                "min": float(valid.min()) if valid.size else None,
                "max": float(valid.max()) if valid.size else None,
                "mean": float(valid.mean()) if valid.size else None,
            },
        }


def main() -> None:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEM_DIR
    files = find_files(target)
    if not files:
        sys.exit(f"No raster files found in {target}. Expected extensions: {sorted(EXTS)}")
    results = []
    for f in files:
        try:
            results.append(inspect(f))
        except Exception as exc:  # report, don't hide: a file GDAL cannot read is a finding
            results.append({"file": f.name, "error": f"{type(exc).__name__}: {exc}"})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))
    print(f"\nSaved to {OUT}")


if __name__ == "__main__":
    main()
