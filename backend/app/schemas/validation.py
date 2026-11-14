from typing import Optional
from pydantic import BaseModel


class HorizonsRow(BaseModel):
    utc: str
    horizons_az_deg: float
    horizons_el_deg: float
    lunaris_az_deg: float
    lunaris_el_deg: float
    delta_az_deg: float
    delta_el_deg: float
    sky_error_deg: float
    passed: bool


class HorizonsCase(BaseModel):
    site_name: str
    latitude: float
    longitude_east: float
    height_m: float
    body: str
    n_epochs: int
    max_abs_delta_az_deg: float
    max_abs_delta_el_deg: float
    max_sky_error_deg: float
    passed: bool
    rows: list[HorizonsRow]


class HorizonsReport(BaseModel):
    source: str
    retrieved_utc: str
    tolerance_deg: float
    n_epochs: int
    n_cases: int
    all_pass: bool
    max_abs_delta_az_deg: float
    max_abs_delta_el_deg: float
    rms_delta_az_deg: float
    rms_delta_el_deg: float
    max_sky_error_deg: float
    rms_sky_error_deg: float
    solar_disk_diameters: float
    cases: list[HorizonsCase]
    notes: list[str]


class LayerStats(BaseModel):
    unit: str
    n: int
    min: Optional[float]
    max: Optional[float]
    mean: Optional[float]
    p50: Optional[float]
    p95: Optional[float]


class TerrainConfidence(BaseModel):
    site_id: str
    shape_px: list[int]
    pixel_size_m: float
    n_pixels: int
    layers_available: list[str]
    lola_return_fraction: Optional[float]
    height_uncertainty: Optional[LayerStats]
    slope_uncertainty: Optional[LayerStats]
    our_slope: LayerStats
    notes: list[str]


class NasaSlopeCheck(BaseModel):
    site_id: str
    n_compared: int
    rms_diff_deg: float
    mean_diff_deg: float
    max_abs_diff_deg: float
    p95_abs_diff_deg: float
    notes: list[str]


class PendingCheck(BaseModel):
    id: str
    name: str
    status: str
    why: str
    url: str


class MethodLimit(BaseModel):
    id: str
    title: str
    detail: str


class ValidationReport(BaseModel):
    site_id: str
    horizons: Optional[HorizonsReport]
    horizons_error: Optional[str]
    terrain: Optional[TerrainConfidence]
    terrain_error: Optional[str]
    nasa_slope: Optional[NasaSlopeCheck]
    pending: list[PendingCheck]
    method_limits: list[MethodLimit]
