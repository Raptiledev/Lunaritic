from pydantic import BaseModel


class BodyTrack(BaseModel):
    body: str
    azimuth_deg: list[float]
    elevation_deg: list[float]
    distance_km: list[float]
    angular_radius_deg: list[float]
    elevation_min_deg: float
    elevation_max_deg: float


class EphemerisResponse(BaseModel):
    latitude: float
    longitude_east: float
    height_m: float
    frame: str
    aberration_correction: str
    times_utc: list[str]
    step_minutes: float
    tracks: list[BodyTrack]
    notes: list[str]
