"""Independent checks of LUNARIS calculations (Phase 8).

What is actually run
--------------------
1. JPL Horizons vs SPICE. The fixture in data/validation/horizons_reference.json holds 108 airless topocentric
   azimuth/elevation samples. Each is recomputed with our SPICE path and compared. Tolerance used by the tests is
   0.001 deg; observed agreement is about 0.00001 deg.
2. Terrain data confidence from the LOLA product layers themselves: share of pixels with a real LOLA return,
   height RMS (toterr) and slope RMS (slperr).
3. Optional NASA-provided slope cross-check, only when Site*_5mpp_slp.tif is present (not yet downloaded).

What is NOT claimed
-------------------
PGDA south-pole illumination products (Mazarico et al.) are not yet acquired, so no illumination-map comparison is
reported. Horizon truncation is flagged, not corrected: beyond-tile terrain can only lower sunlight and Earth time.
"""
from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path

import numpy as np

from app.services import dem_service as dem
from app.services import ephemeris as eph
from app.services import terrain_service as ts

# Same tolerance as test_ephemeris.test_matches_jpl_horizons; solar disk is ~0.53 deg, so this is ~500x smaller.
HORIZONS_TOLERANCE_DEG = 1e-3


def _angular_daz(our: float, ref: float) -> float:
    return (our - ref + 180.0) % 360.0 - 180.0


def compare_horizons(kernel_dir: Path, ref_path: Path) -> dict:
    if not ref_path.is_file():
        raise FileNotFoundError(f"Horizons reference missing: {ref_path}. Run scripts/fetch_horizons_reference.py.")
    ref = json.loads(ref_path.read_text(encoding="utf-8"))
    cases_out, az_err, el_err = [], [], []
    for case in ref["cases"]:
        s, body = case["site"], case["body"]
        rows_out = []
        for row in case["rows"]:
            t = eph.parse_utc(row["utc"])
            tr = eph.tracks(kernel_dir, s["lat"], s["lon_east"], s["height_m"], t, t, timedelta(hours=1), (body,))[0]
            daz = _angular_daz(float(tr.azimuth_deg[0]), row["azimuth_deg"])
            del_ = float(tr.elevation_deg[0]) - row["elevation_deg"]
            # Horizontal angular error on the sky (az error shrinks near the zenith / nadir; at the poles elevation is near 0).
            sky = abs(daz) * abs(np.cos(np.radians(row["elevation_deg"])))
            az_err.append(daz); el_err.append(del_)
            rows_out.append({"utc": row["utc"], "horizons_az_deg": row["azimuth_deg"], "horizons_el_deg": row["elevation_deg"],
                             "lunaris_az_deg": round(float(tr.azimuth_deg[0]), 6), "lunaris_el_deg": round(float(tr.elevation_deg[0]), 6),
                             "delta_az_deg": round(daz, 8), "delta_el_deg": round(del_, 8),
                             "sky_error_deg": round(float(sky), 8),
                             "passed": bool(sky < HORIZONS_TOLERANCE_DEG and abs(del_) < HORIZONS_TOLERANCE_DEG)})
        cases_out.append({"site_name": s["name"], "latitude": s["lat"], "longitude_east": s["lon_east"], "height_m": s["height_m"],
                          "body": body.lower(), "n_epochs": len(rows_out), "max_abs_delta_az_deg": max(abs(r["delta_az_deg"]) for r in rows_out),
                          "max_abs_delta_el_deg": max(abs(r["delta_el_deg"]) for r in rows_out),
                          "max_sky_error_deg": max(r["sky_error_deg"] for r in rows_out),
                          "passed": all(r["passed"] for r in rows_out), "rows": rows_out})
    az, el = np.asarray(az_err), np.asarray(el_err)
    sky = np.abs(az) * np.abs(np.cos(np.radians([r["horizons_el_deg"] for c in cases_out for r in c["rows"]])))
    return {
        "source": ref["source"], "retrieved_utc": ref["retrieved_utc"], "tolerance_deg": HORIZONS_TOLERANCE_DEG,
        "n_epochs": int(az.size), "n_cases": len(cases_out), "all_pass": bool(all(c["passed"] for c in cases_out)),
        "max_abs_delta_az_deg": float(np.max(np.abs(az))), "max_abs_delta_el_deg": float(np.max(np.abs(el))),
        "rms_delta_az_deg": float(np.sqrt(np.mean(az**2))), "rms_delta_el_deg": float(np.sqrt(np.mean(el**2))),
        "max_sky_error_deg": float(sky.max()), "rms_sky_error_deg": float(np.sqrt(np.mean(sky**2))),
        "solar_disk_diameters": float(HORIZONS_TOLERANCE_DEG / 0.53),   # how many solar diameters the tolerance is
        "cases": cases_out,
        "notes": [
            "Horizons uses DE441 and the MEAN_ME lunar frame; LUNARIS uses DE421 and MOON_ME (the LOLA DEM's frame). "
            "The residual of about 0.00001° is consistent with that small frame / ephemeris difference.",
            f"A case passes when |elevation error| and the on-sky azimuth error are both below {HORIZONS_TOLERANCE_DEG}° "
            f"(about {HORIZONS_TOLERANCE_DEG / 0.53:.0e} of the Sun's apparent diameter).",
            "This comparison is geometry only: it does not validate the terrain horizon or the visibility fractions.",
        ],
    }


def terrain_confidence(site_id: str) -> dict:
    s = ts.get_site(site_id)
    p = ts.get_products(site_id)
    n = int(np.prod(s.shape))

    def stats(a: np.ndarray, unit: str) -> dict:
        ok = a[np.isfinite(a)]
        return {"unit": unit, "n": int(ok.size), "min": float(ok.min()) if ok.size else None, "max": float(ok.max()) if ok.size else None,
                "mean": float(ok.mean()) if ok.size else None, "p50": float(np.percentile(ok, 50)) if ok.size else None,
                "p95": float(np.percentile(ok, 95)) if ok.size else None}

    ldec = s.layers.get("ldec")
    measured = float((ldec > 0).mean()) if ldec is not None else None
    out = {
        "site_id": site_id, "shape_px": list(s.shape), "pixel_size_m": s.pixel_size_m, "n_pixels": n,
        "layers_available": list(s.layers),
        "lola_return_fraction": measured,
        "height_uncertainty": stats(s.layers["toterr"], "m") if "toterr" in s.layers else None,
        "slope_uncertainty": stats(s.layers["slperr"], "deg") if "slperr" in s.layers else None,
        "our_slope": stats(p["slope"], "deg"),
        "notes": [
            "Height and slope uncertainties are the NASA product's reported RMS errors (toterr, slperr), not invented by LUNARIS.",
            "Pixels with zero LOLA returns are interpolated by the NASA product; LUNARIS does not invent heights for them.",
            "Hazard classification marks a pixel Insufficient data when its slope uncertainty exceeds 5°.",
        ],
    }
    return out


def nasa_slope_crosscheck(site_id: str) -> dict | None:
    """Compare our Horn 3x3 slope with the NASA-provided slp layer, when present."""
    s = ts.get_site(site_id)
    if "slp" not in s.layers:
        return None
    ours, nasa = ts.get_products(site_id)["slope"], s.layers["slp"]
    ok = np.isfinite(ours) & np.isfinite(nasa)
    d = ours[ok] - nasa[ok]
    return {
        "site_id": site_id, "n_compared": int(ok.sum()),
        "rms_diff_deg": float(np.sqrt(np.mean(d**2))), "mean_diff_deg": float(d.mean()),
        "max_abs_diff_deg": float(np.max(np.abs(d))), "p95_abs_diff_deg": float(np.percentile(np.abs(d), 95)),
        "notes": ["Both slopes are in degrees on the same 5 m grid. Differences of a few tenths of a degree are expected "
                  "from window size and algorithm details; large differences would flag a DEM or CRS problem."],
    }


def pending_checks() -> list[dict]:
    return [
        {"id": "pgda-illumination", "name": "PGDA south-pole illumination maps (Mazarico et al.)",
         "status": "not_acquired",
         "why": "NASA publishes average-illumination products for the south pole. Comparing our sunlight-% map with theirs "
                "would be a strong independent terrain+ephemeris check. The product has not been downloaded yet.",
         "url": "https://pgda.gsfc.nasa.gov/"},
        {"id": "nasa-slope", "name": "NASA-provided Site01 slope GeoTIFF",
         "status": "not_acquired",
         "why": "Site01_final_adj_5mpp_slp.tif would let us cross-check our Horn 3x3 slope against NASA's published slope map.",
         "url": "https://core2.gsfc.nasa.gov/PGDA/LOLA_5mpp/"},
    ]


def report(kernel_dir: Path, data_dir: Path, site_id: str = "site01") -> dict:
    horizons = None
    horizons_error = None
    try:
        if eph.kernel_status(kernel_dir)["ready"]:
            horizons = compare_horizons(kernel_dir, data_dir / "validation" / "horizons_reference.json")
        else:
            horizons_error = "SPICE kernels are not installed; the Horizons comparison cannot be run."
    except eph.EphemerisUnavailable as e:
        horizons_error = str(e)
    except FileNotFoundError as e:
        horizons_error = str(e)

    terrain = None
    terrain_error = None
    try:
        terrain = terrain_confidence(site_id)
    except Exception as e:
        terrain_error = f"{type(e).__name__}: {e}"

    slope = None
    try:
        slope = nasa_slope_crosscheck(site_id)
    except Exception:
        slope = None

    return {
        "site_id": site_id,
        "horizons": horizons, "horizons_error": horizons_error,
        "terrain": terrain, "terrain_error": terrain_error,
        "nasa_slope": slope,
        "pending": pending_checks(),
        "method_limits": [
            {"id": "horizon_truncation", "title": "Horizon truncated by the 16 km tile",
             "detail": "Rays that leave the DEM give a lower-bound horizon. Sunlight and Earth-in-view shares are therefore "
                       "UPPER bounds; longest-darkness values are LOWER bounds. Mountains beyond the tile are unknown."},
            {"id": "geometry_only", "title": "Geometry, not engineering models",
             "detail": "Sunlit means the Sun's disk clears the terrain; it is not electrical power. Earth in view means the "
                       "disk centre clears the terrain; it is not a radio link budget."},
            {"id": "grid_cell", "title": "100 m map cells",
             "detail": "Mission-window maps sample every 100 m. Near ridges, sunlight can change within metres; confirm a "
                       "chosen spot with the point analysis."},
            {"id": "interpolated_dem", "title": "Most DEM pixels are interpolated",
             "detail": "Only about 9.5% of Site01 pixels contain a LOLA return; the rest are filled by the NASA product. "
                       "Height and slope uncertainties from toterr/slperr quantify that."},
        ],
    }
