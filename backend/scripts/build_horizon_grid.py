"""Build the cached horizon grid used by the illumination maps (run once per site, from backend/).

    python -m scripts.build_horizon_grid --site site01 [--spacing 100] [--height 2] [--workers 8]

Runs the same horizon engine as /api/terrain/{site}/horizon at every grid node and writes
app/data/cache/horizon_grid_<site>_<spacing>m_h<height>m.npz.
"""
from __future__ import annotations

import argparse

from app.core.config import settings
from app.services import illumination_maps as im


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", default="site01")
    ap.add_argument("--spacing", type=float, default=im.DEFAULT_SPACING_M, help="grid spacing in metres")
    ap.add_argument("--height", type=float, default=im.DEFAULT_OBSERVER_HEIGHT_M, help="observer height above ground, m")
    ap.add_argument("--workers", type=int, default=None)
    a = ap.parse_args()

    def progress(done: int, total: int, elapsed: float) -> None:
        if done % 10 == 0 or done == total:
            eta = elapsed / done * (total - done)
            print(f"  rows {done}/{total}  elapsed {elapsed / 60:.1f} min  remaining ~{eta / 60:.1f} min", flush=True)

    out = im.build_horizon_grid(settings.dem_dir, settings.data_dir / "cache", a.site, a.spacing, a.height, a.workers, progress)
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
