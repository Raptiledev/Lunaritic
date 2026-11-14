from typing import Optional
from pydantic import BaseModel


class PeriodModel(BaseModel):
    start_utc: str
    end_utc: str
    hours: float
    starts_before_window: bool
    ends_after_window: bool


class BodySummary(BaseModel):
    visible_at_start: bool
    fraction_of_time: float
    mean_disk_fraction: float
    fully_visible_fraction_of_time: float
    next_event: str
    hours_to_next_event: Optional[float]
    longest_visible_hours: float
    longest_hidden_hours: float
    longest_hidden_is_open: bool
    elevation_when_visible_mean_deg: Optional[float]
    elevation_max_deg: float
    periods: list[PeriodModel]


class VisibilitySeries(BaseModel):
    times_utc: list[str]
    sun_azimuth_deg: list[float]
    sun_elevation_deg: list[float]
    sun_horizon_deg: list[float]
    sun_visible_fraction: list[float]
    earth_azimuth_deg: list[float]
    earth_elevation_deg: list[float]
    earth_horizon_deg: list[float]
    earth_visible_fraction: list[float]


class MapCell(BaseModel):
    x_m: float
    y_m: float
    latitude: float
    longitude_east: float
    sun_lit: float
    sun_dark_h: float
    earth_view: float


class LayerStats(BaseModel):
    min: Optional[float]
    max: Optional[float]
    mean: Optional[float]


class MapsStatus(BaseModel):
    site_id: str
    built: bool
    spacing_m: float
    observer_height_m: float
    built_utc: Optional[str]
    nodes: Optional[int]
    build_command: str


class MapsResponse(BaseModel):
    site_id: str
    spacing_m: float
    observer_height_m: float
    nx: int
    ny: int
    bounds_xy_m: tuple[float, float, float, float]  
    start_utc: str
    stop_utc: str
    step_minutes: float
    n_samples: int
    compute_seconds: float
    grid_built_utc: str
    layers: dict[str, list[Optional[float]]]        
    stats: dict[str, LayerStats]
    brightest: list[MapCell]
    horizon_incomplete_mean: float
    upper_bound: bool
    definitions: dict[str, str]
    notes: list[str]


class CalendarDay(BaseModel):
    start_utc: str
    sun_lit: float
    sun_dark_h: float
    earth_view: float
    earth_gap_h: float
    both: float
    sunlit_at_landing: bool
    earth_at_landing: bool


class CalendarResponse(BaseModel):
    site_id: str
    latitude: float
    longitude_east: float
    x_m: float
    y_m: float
    ground_elevation_m: float
    observer_height_m: float
    duration_days: float
    step_minutes: float
    n_samples: int
    days: list[CalendarDay]
    upper_bound: bool
    notes: list[str]


class AlternativeCell(BaseModel):
    x_m: float
    y_m: float
    latitude: float
    longitude_east: float
    distance_m: float
    bearing_true_deg: float
    sun_lit: float
    sun_dark_h: float
    earth_view: float
    both: float
    favorable_share: float
    slope_p95_deg: float
    passes: dict[str, bool]


class AlternativesResponse(BaseModel):
    site_id: str
    start_utc: str
    stop_utc: str
    radius_m: float
    requirements: dict[str, float]
    target: AlternativeCell
    alternatives: list[AlternativeCell]
    cells_passing_in_tile: int
    notes: list[str]


class ScoreCandidateIn(BaseModel):
    name: str = ""
    lat: float | None = None
    lon: float | None = None
    x: float | None = None
    y: float | None = None


class CompareRequest(BaseModel):
    start: str
    stop: str
    observer_height_m: float = 2.0
    step_min: float = 30.0
    candidates: list[ScoreCandidateIn]
    requirements: dict[str, float] | None = None
    weights: dict[str, float] | None = None


class ScoredCandidate(BaseModel):
    name: str
    site_id: str
    latitude: float
    longitude_east: float
    x_m: float
    y_m: float
    ground_elevation_m: float
    slope_p95_deg: float | None
    roughness_mean_m: float | None
    upper_bound: bool
    horizon_incomplete_fraction: float
    eligible: bool
    overall: float
    rank: int
    scores: dict[str, float]
    contributions: dict[str, float]
    gates: dict[str, bool]
    failed_gates: list[str]
    metrics: dict[str, float]


class CompareResponse(BaseModel):
    site_id: str
    start_utc: str
    stop_utc: str
    step_minutes: float
    observer_height_m: float
    requirements: dict[str, float]
    weights: dict[str, float]
    candidates: list[ScoredCandidate]
    eligible_count: int
    notes: list[str]
    definitions: dict[str, str]


class VisibilityResponse(BaseModel):
    site_id: str
    latitude: float
    longitude_east: float
    ground_elevation_m: float
    observer_height_m: float
    start_utc: str
    stop_utc: str
    step_minutes: float
    n_samples: int
    sun: BodySummary
    earth: BodySummary
    both_fraction_of_time: float
    neither_fraction_of_time: float
    horizon_incomplete_fraction: float
    sun_rays_truncated_share: float
    earth_rays_truncated_share: float
    upper_bound: bool
    series: VisibilitySeries
    definitions: dict[str, str]
    notes: list[str]
