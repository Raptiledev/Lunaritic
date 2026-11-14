from typing import Optional
from pydantic import BaseModel


class SiteInfo(BaseModel):
    site_id: str
    files: dict[str, str]
    shape_px: tuple[int, int]
    pixel_size_m: float
    bounds_xy_m: tuple[float, float, float, float]
    lat_min: float
    lat_max: float
    layers_available: list[str]
    crs: str = "South polar stereographic, Moon sphere R=1737.4 km, lat_0=-90, lon_0=0 (MOON_ME frame, DE421)"


class PointInfo(BaseModel):
    x_m: float
    y_m: float
    latitude: float
    longitude_east: float
    row: int
    col: int
    elevation_m: Optional[float]
    slope_deg: Optional[float]
    aspect_deg_grid_north: Optional[float]
    roughness_rms_m: Optional[float]
    relief_m: Optional[float]
    lola_returns_in_pixel: Optional[float]
    total_z_uncertainty_m: Optional[float]
    slope_uncertainty_deg: Optional[float]
    hazard: str


class AreaSummary(BaseModel):
    center_lat: float
    center_lon_east: float
    radius_m: float
    coverage_fraction: float
    n_pixels: int
    elevation_mean_m: Optional[float]
    slope_mean_deg: Optional[float]
    slope_p95_deg: Optional[float]
    slope_max_deg: Optional[float]
    roughness_mean_m: Optional[float]
    roughness_max_m: Optional[float]
    hazard_fractions: dict[str, float]
    pixels_with_lola_return_fraction: Optional[float]
    total_z_uncertainty_mean_m: Optional[float]
    slope_uncertainty_mean_deg: Optional[float]
    notes: list[str]


class MeshGrid(BaseModel):
    site_id: str
    nx: int
    ny: int
    step_px: int
    spacing_m: float
    x_m: list[float]
    y_m: list[float]
    z_m: list[Optional[float]]
    z_min_m: Optional[float]
    z_max_m: Optional[float]
    z_mean_m: Optional[float]
    bounds_xy_m: tuple[float, float, float, float]
    notes: list[str]


class HorizonResponse(BaseModel):
    site_id: str
    latitude: float
    longitude_east: float
    x_m: float
    y_m: float
    ground_elevation_m: float
    observer_height_m: float
    azimuth_true_deg: list[float]
    horizon_deg: list[Optional[float]]
    horizon_distance_m: list[Optional[float]]
    ray_length_m: list[float]
    incomplete: list[bool]
    max_horizon_deg: Optional[float]
    max_horizon_azimuth_deg: Optional[float]
    mean_horizon_deg: Optional[float]
    incomplete_fraction: float
    max_range_m: float
    step_m: float
    model: str
    notes: list[str]
