from datetime import timedelta

from fastapi import APIRouter, HTTPException, Query
from app.core.config import settings
from app.schemas.ephemeris import BodyTrack, EphemerisResponse
from app.services import ephemeris as eph

router = APIRouter(prefix="/ephemeris", tags=["ephemeris"])


@router.get("/status")
def status() -> dict:
    return eph.kernel_status(settings.kernel_dir)


@router.get("/track", response_model=EphemerisResponse)
def track(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=360),
          height_m: float = Query(0.0, ge=-10000, le=12000, description="Height above the 1737.4 km sphere (DEM elevation + observer height)"),
          start: str = Query(..., description="ISO UTC, e.g. 2027-01-01T00:00:00Z"), stop: str | None = None,
          step_min: float = Query(60.0, gt=0, le=1440), bodies: str = "sun,earth") -> EphemerisResponse:
    try:
        t0 = eph.parse_utc(start)
        t1 = eph.parse_utc(stop) if stop else t0
    except ValueError as e:
        raise HTTPException(422, f"Times must be ISO 8601 UTC: {e}")
    names = tuple(b.strip().upper() for b in bodies.split(",") if b.strip())
    if not names or any(b not in eph.BODY_RADIUS_KM for b in names):
        raise HTTPException(422, f"bodies must be a comma list of: {', '.join(k.lower() for k in eph.BODY_RADIUS_KM)}")
    lon_e = lon % 360.0
    try:
        trs = eph.tracks(settings.kernel_dir, lat, lon_e, height_m, t0, t1, timedelta(minutes=step_min), names)
    except eph.EphemerisUnavailable as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:   # SPICE errors, e.g. a time outside kernel coverage (DE421/PA: 1900-2050)
        raise HTTPException(422, f"SPICE could not compute this request: {type(e).__name__}: {str(e).strip()[:300]}")
    r = lambda a, d: [round(float(v), d) for v in a]
    return EphemerisResponse(
        latitude=lat, longitude_east=lon_e, height_m=height_m, frame=eph.FRAME, aberration_correction=eph.ABCORR,
        times_utc=trs[0].times_utc, step_minutes=step_min,
        tracks=[BodyTrack(body=t.body.lower(), azimuth_deg=r(t.azimuth_deg, 5), elevation_deg=r(t.elevation_deg, 5),
                          distance_km=r(t.distance_km, 1), angular_radius_deg=r(t.angular_radius_deg, 5),
                          elevation_min_deg=float(t.elevation_deg.min()), elevation_max_deg=float(t.elevation_deg.max())) for t in trs],
        notes=["Apparent direction from the surface point (light time + stellar aberration). No refraction: the Moon has no atmosphere.",
               "Elevation is of the disk centre above the local horizontal of the 1737.4 km sphere, the same plane the terrain horizon uses.",
               "Validated against JPL Horizons (airless, topocentric on the Moon) to about 0.00001°; see the Data & Method page."])
