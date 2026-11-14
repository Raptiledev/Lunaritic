"""Fetch independent Sun/Earth azimuth-elevation references from JPL Horizons (validation only, not used at runtime).

Usage:  python scripts/fetch_horizons_reference.py
Writes app/data/validation/horizons_reference.json, which test_ephemeris.py compares against our SPICE results.
Horizons is queried as an airless topocentric observer on the Moon (CENTER=coord@301, MEAN_ME frame, 1737.4 km sphere).
"""
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT = Path(__file__).resolve().parents[1] / "app" / "data" / "validation" / "horizons_reference.json"

SITES = [
    # Site01 centre: lat/lon/height read from the LOLA DEM at grid (-11000, -12000) m.
    {"name": "Site01 centre (south pole)", "lat": -89.46316, "lon_east": 222.5104, "height_m": 1944.8},
    {"name": "Apollo 11 (equatorial, for contrast)", "lat": 0.67408, "lon_east": 23.47297, "height_m": 0.0},
]
WINDOWS = [("2027-01-01 00:00", "2027-03-01 00:00", "73 h"), ("2030-06-01 00:00", "2030-07-01 00:00", "5 d")]
BODIES = {"SUN": "10", "EARTH": "399"}


def query(body: str, site: dict, start: str, stop: str, step: str) -> tuple[str, list[dict]]:
    params = {
        "format": "text", "COMMAND": f"'{body}'", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{site['lon_east']},{site['lat']},{site['height_m'] / 1000.0}'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'", "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'", "STEP_SIZE": f"'{step}'",
        "QUANTITIES": "'4'", "ANG_FORMAT": "'DEG'", "APPARENT": "'AIRLESS'", "CSV_FORMAT": "'YES'", "EXTRA_PREC": "'YES'",
        "TIME_DIGITS": "'SECONDS'", "OBJ_DATA": "'NO'",
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    text = urllib.request.urlopen(url, timeout=60).read().decode()
    if "$$SOE" not in text:
        raise RuntimeError(f"Horizons returned no ephemeris:\n{text[:2000]}")
    rows = []
    for line in text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines():
        f = [c.strip() for c in line.split(",")]
        t = datetime.strptime(f[0], "%Y-%b-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        rows.append({"utc": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "azimuth_deg": float(f[3]), "elevation_deg": float(f[4])})
    src = next((l.strip() for l in text.splitlines() if l.startswith("Target body name")), "")
    return f"{src} | {url}", rows


def main() -> None:
    out = {"retrieved_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "source": "JPL Horizons API, observer table, quantity 4 (airless apparent az/el), CENTER=coord@301", "cases": []}
    for site in SITES:
        for name, code in BODIES.items():
            for start, stop, step in WINDOWS:
                provenance, rows = query(code, site, start, stop, step)
                out["cases"].append({"site": site, "body": name, "provenance": provenance, "rows": rows})
                print(f"{site['name']:40s} {name:5s} {start[:10]} {len(rows)} rows")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
