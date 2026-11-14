export interface Health { status: string; service: string; version: string }

export type DatasetStatus = "not_acquired" | "acquired" | "unavailable" | "remote";

export interface Dataset {
  id: string;
  name: string;
  provider: string;
  role: string;
  url: string;
  status: DatasetStatus;
  resolution_m: number | null;
  crs: string | null;
  vertical_reference: string | null;
  units: string | null;
  coverage: string | null;
  product_date: string | null;
  processing_steps: string[];
  notes: string | null;
}

export interface DatasetList { datasets: Dataset[]; acquired_count: number; total_count: number }

export interface MissionConfig {
  name: string;
  latitude: string;
  longitude: string;
  date: string;
  time: string;
  durationDays: string;
  heightM: string;
  siteId?: string;
}

export interface SiteInfo {
  site_id: string;
  files: Record<string, string>;
  shape_px: [number, number];
  pixel_size_m: number;
  bounds_xy_m: [number, number, number, number];
  lat_min: number;
  lat_max: number;
  layers_available: string[];
  crs: string;
}

export interface PointInfo {
  x_m: number; y_m: number; latitude: number; longitude_east: number; row: number; col: number;
  elevation_m: number | null; slope_deg: number | null; aspect_deg_grid_north: number | null;
  roughness_rms_m: number | null; relief_m: number | null; lola_returns_in_pixel: number | null;
  total_z_uncertainty_m: number | null; slope_uncertainty_deg: number | null; hazard: string;
}

export interface AreaSummary {
  center_lat: number; center_lon_east: number; radius_m: number; coverage_fraction: number; n_pixels: number;
  elevation_mean_m: number | null; slope_mean_deg: number | null; slope_p95_deg: number | null; slope_max_deg: number | null;
  roughness_mean_m: number | null; roughness_max_m: number | null; hazard_fractions: Record<string, number>;
  pixels_with_lola_return_fraction: number | null; total_z_uncertainty_mean_m: number | null;
  slope_uncertainty_mean_deg: number | null; notes: string[];
}

export interface BodyTrack {
  body: "sun" | "earth"; azimuth_deg: number[]; elevation_deg: number[]; distance_km: number[]; angular_radius_deg: number[];
  elevation_min_deg: number; elevation_max_deg: number;
}

export interface EphemerisResponse {
  latitude: number; longitude_east: number; height_m: number; frame: string; aberration_correction: string;
  times_utc: string[]; step_minutes: number; tracks: BodyTrack[]; notes: string[];
}

export interface Period { start_utc: string; end_utc: string; hours: number; starts_before_window: boolean; ends_after_window: boolean }

export interface BodySummary {
  visible_at_start: boolean; fraction_of_time: number; mean_disk_fraction: number; fully_visible_fraction_of_time: number;
  next_event: string; hours_to_next_event: number | null; longest_visible_hours: number; longest_hidden_hours: number;
  longest_hidden_is_open: boolean; elevation_when_visible_mean_deg: number | null; elevation_max_deg: number; periods: Period[];
}

export interface VisibilityResponse {
  site_id: string; latitude: number; longitude_east: number; ground_elevation_m: number; observer_height_m: number;
  start_utc: string; stop_utc: string; step_minutes: number; n_samples: number; sun: BodySummary; earth: BodySummary;
  both_fraction_of_time: number; neither_fraction_of_time: number; horizon_incomplete_fraction: number;
  sun_rays_truncated_share: number; earth_rays_truncated_share: number; upper_bound: boolean;
  series: {
    times_utc: string[]; sun_azimuth_deg: number[]; sun_elevation_deg: number[]; sun_horizon_deg: number[]; sun_visible_fraction: number[];
    earth_azimuth_deg: number[]; earth_elevation_deg: number[]; earth_horizon_deg: number[]; earth_visible_fraction: number[];
  };
  definitions: Record<string, string>; notes: string[];
}

export type MapLayerId = "sun_lit" | "sun_disk" | "sun_dark_h" | "earth_view" | "earth_gap_h" | "both";

export interface MapCell { x_m: number; y_m: number; latitude: number; longitude_east: number; sun_lit: number; sun_dark_h: number; earth_view: number }

export interface MapsStatus {
  site_id: string; built: boolean; spacing_m: number; observer_height_m: number; built_utc: string | null; nodes: number | null; build_command: string;
}

export interface MapsResponse {
  site_id: string; spacing_m: number; observer_height_m: number; nx: number; ny: number;
  bounds_xy_m: [number, number, number, number]; start_utc: string; stop_utc: string; step_minutes: number; n_samples: number;
  compute_seconds: number; grid_built_utc: string; layers: Record<MapLayerId, (number | null)[]>;
  stats: Record<MapLayerId, { min: number | null; max: number | null; mean: number | null }>;
  brightest: MapCell[]; horizon_incomplete_mean: number; upper_bound: boolean; definitions: Record<string, string>; notes: string[];
}

/** Mission requirements for the Slip Planner and Compare. Defaults are illustrative, not NASA requirements. */
export interface Requirements { minSunPct: number; maxDarkH: number; minEarthPct: number; minFavorablePct: number }

export interface ScoreWeights { sunlight: number; darkness: number; earth: number; terrain: number }

export interface ScoreCandidate { name?: string; lat?: number; lon?: number; x?: number; y?: number }

export interface ScoredCandidate {
  name: string; site_id: string; latitude: number; longitude_east: number; x_m: number; y_m: number;
  ground_elevation_m: number; slope_p95_deg: number | null; roughness_mean_m: number | null;
  upper_bound: boolean; horizon_incomplete_fraction: number; eligible: boolean; overall: number; rank: number;
  scores: Record<string, number>; contributions: Record<string, number>; gates: Record<string, boolean>;
  failed_gates: string[]; metrics: Record<string, number>;
}

export interface CompareResponse {
  site_id: string; start_utc: string; stop_utc: string; step_minutes: number; observer_height_m: number;
  requirements: Record<string, number>; weights: ScoreWeights; candidates: ScoredCandidate[]; eligible_count: number;
  notes: string[]; definitions: Record<string, string>;
}

export interface CalendarDay {
  start_utc: string; sun_lit: number; sun_dark_h: number; earth_view: number; earth_gap_h: number; both: number;
  sunlit_at_landing: boolean; earth_at_landing: boolean;
}

export interface CalendarResponse {
  site_id: string; latitude: number; longitude_east: number; x_m: number; y_m: number; ground_elevation_m: number;
  observer_height_m: number; duration_days: number; step_minutes: number; n_samples: number; days: CalendarDay[];
  upper_bound: boolean; notes: string[];
}

export interface AlternativeCell {
  x_m: number; y_m: number; latitude: number; longitude_east: number; distance_m: number; bearing_true_deg: number;
  sun_lit: number; sun_dark_h: number; earth_view: number; both: number; favorable_share: number; slope_p95_deg: number;
  passes: Record<"sunlight" | "darkness" | "earth" | "terrain", boolean>;
}

export interface AlternativesResponse {
  site_id: string; start_utc: string; stop_utc: string; radius_m: number; requirements: Record<string, number>;
  target: AlternativeCell; alternatives: AlternativeCell[]; cells_passing_in_tile: number; notes: string[];
}

export interface HorizonsCase {
  site_name: string; latitude: number; longitude_east: number; height_m: number; body: string; n_epochs: number;
  max_abs_delta_az_deg: number; max_abs_delta_el_deg: number; max_sky_error_deg: number; passed: boolean;
  rows: { utc: string; horizons_az_deg: number; horizons_el_deg: number; lunaris_az_deg: number; lunaris_el_deg: number;
    delta_az_deg: number; delta_el_deg: number; sky_error_deg: number; passed: boolean }[];
}

export interface ValidationReport {
  site_id: string;
  horizons: {
    source: string; retrieved_utc: string; tolerance_deg: number; n_epochs: number; n_cases: number; all_pass: boolean;
    max_abs_delta_az_deg: number; max_abs_delta_el_deg: number; rms_delta_az_deg: number; rms_delta_el_deg: number;
    max_sky_error_deg: number; rms_sky_error_deg: number; solar_disk_diameters: number; cases: HorizonsCase[]; notes: string[];
  } | null;
  horizons_error: string | null;
  terrain: {
    site_id: string; shape_px: number[]; pixel_size_m: number; n_pixels: number; layers_available: string[];
    lola_return_fraction: number | null;
    height_uncertainty: { unit: string; mean: number | null; p50: number | null; p95: number | null; min: number | null; max: number | null } | null;
    slope_uncertainty: { unit: string; mean: number | null; p50: number | null; p95: number | null; min: number | null; max: number | null } | null;
    our_slope: { unit: string; mean: number | null; p95: number | null; max: number | null };
    notes: string[];
  } | null;
  terrain_error: string | null;
  nasa_slope: { site_id: string; n_compared: number; rms_diff_deg: number; mean_diff_deg: number; max_abs_diff_deg: number;
    p95_abs_diff_deg: number; notes: string[] } | null;
  pending: { id: string; name: string; status: string; why: string; url: string }[];
  method_limits: { id: string; title: string; detail: string }[];
}

export interface MeshGrid {
  site_id: string; nx: number; ny: number; step_px: number; spacing_m: number;
  x_m: number[]; y_m: number[]; z_m: (number | null)[];
  z_min_m: number | null; z_max_m: number | null; z_mean_m: number | null;
  bounds_xy_m: [number, number, number, number]; notes: string[];
}

export interface HorizonResponse {
  site_id: string; latitude: number; longitude_east: number; x_m: number; y_m: number;
  ground_elevation_m: number; observer_height_m: number;
  azimuth_true_deg: number[]; horizon_deg: (number | null)[]; horizon_distance_m: (number | null)[];
  ray_length_m: number[]; incomplete: boolean[];
  max_horizon_deg: number | null; max_horizon_azimuth_deg: number | null; mean_horizon_deg: number | null;
  incomplete_fraction: number; max_range_m: number; step_m: number; model: string; notes: string[];
}
