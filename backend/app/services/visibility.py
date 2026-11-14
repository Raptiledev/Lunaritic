"""Sunlight and Earth visibility over a mission window at one surface point (Phase 5).

For every epoch the SPICE Sun/Earth direction is compared with the terrain horizon at that azimuth, using the finite
apparent disk (horizon_analysis.disk_visible_fractions). From that time series:

  * Sun "lit"        : any part of the solar disk is above the terrain horizon (fraction > 0).
  * sunlight_mean    : time-average of the visible fraction of the solar disk (a geometric proxy for available sunlight).
  * Earth "in view"  : the centre of Earth's disk is above the terrain horizon (visible fraction >= 0.5).
  * periods          : contiguous runs of lit / in-view samples; each sample stands for one time step.
  * longest darkness : longest run with no part of the Sun visible (what a battery must survive).

Limits, reported to the user:
  * The DEM tile ends ~8-16 km from the point; rays that leave it give a horizon that is a LOWER bound, so the
    visibility figures are UPPER bounds wherever rays were truncated.
  * Events (sunset etc.) are located to +/- half a time step.
  * Geometry only: no solar-panel model, no link budget, no thermal model.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np

from app.services import ephemeris as eph
from app.services import horizon_analysis as ha

EARTH_VISIBLE_MIN_FRACTION = 0.5
MAX_SAMPLES = 6000


@dataclass
class Period:
    start_utc: str
    end_utc: str
    hours: float
    starts_before_window: bool
    ends_after_window: bool


def runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """(first, last) inclusive index pairs of contiguous True runs."""
    m = np.concatenate([[False], np.asarray(mask, bool), [False]])
    d = np.diff(m.astype(int))
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1) - 1))


def _periods(mask: np.ndarray, times: list[str], step_h: float) -> list[Period]:
    """Each sample stands for the step that follows it; the last sample of the window is the window end itself."""
    n = len(mask)
    return [Period(times[a], times[b], round((min(b + 1, n - 1) - a) * step_h, 3), a == 0, b == n - 1) for a, b in runs(mask)]


def _hours_until_change(mask: np.ndarray, step_h: float) -> float | None:
    """Hours from the window start until the state first changes, or None if it never changes in the window."""
    change = np.flatnonzero(mask != mask[0])
    return None if change.size == 0 else round(float(change[0]) * step_h, 3)


def _body_summary(mask: np.ndarray, frac: np.ndarray, el: np.ndarray, times: list[str], step_h: float, rise: str, set_: str) -> dict:
    shown, hidden = _periods(mask, times, step_h), _periods(~mask, times, step_h)
    longest_hidden = max(hidden, key=lambda p: p.hours, default=None)
    return {
        "visible_at_start": bool(mask[0]),
        "fraction_of_time": float(mask.mean()),
        "mean_disk_fraction": float(frac.mean()),
        "fully_visible_fraction_of_time": float((frac >= 0.999).mean()),
        "next_event": set_ if mask[0] else rise,
        "hours_to_next_event": _hours_until_change(mask, step_h),
        "longest_visible_hours": max((p.hours for p in shown), default=0.0),
        "longest_hidden_hours": longest_hidden.hours if longest_hidden else 0.0,
        # True when that run touches a window edge, so the real gap may be longer than the window shows.
        "longest_hidden_is_open": bool(longest_hidden and (longest_hidden.starts_before_window or longest_hidden.ends_after_window)),
        "elevation_when_visible_mean_deg": float(el[mask].mean()) if mask.any() else None,
        "elevation_max_deg": float(el.max()),
        "periods": [p.__dict__ for p in shown],
    }


CALENDAR_MAX_SAMPLES = 25000


def _longest_hidden_hours(mask: np.ndarray, step_h: float) -> float:
    n = len(mask)
    return max(((min(b + 1, n - 1) - a) * step_h for a, b in runs(~mask)), default=0.0)


def calendar(profile: ha.HorizonProfile, kernel_dir, first_start: datetime, n_days: int, duration: timedelta,
             step: timedelta) -> dict:
    """Mission-window metrics for landings on n_days consecutive days (Slip Planner).

    One SPICE track covers every window; each day's window is a slice of it, so every day is evaluated with exactly
    the same rules as `analyse` (same disk test, same period counting)."""
    if not (1 <= n_days <= 400):
        raise ValueError("n_days must be between 1 and 400.")
    per_day, per_window = timedelta(days=1) / step, duration / step
    if abs(per_day - round(per_day)) > 1e-9 or abs(per_window - round(per_window)) > 1e-9:
        raise ValueError("The time step must divide one day and the mission duration exactly.")
    per_day, per_window = round(per_day), round(per_window)
    stop = first_start + (n_days - 1) * timedelta(days=1) + duration
    n = int((stop - first_start) / step) + 1
    if n > CALENDAR_MAX_SAMPLES:
        raise ValueError(f"{n} samples requested; the limit is {CALENDAR_MAX_SAMPLES}. Use fewer days or a larger step.")
    height = profile.ground_elevation_m + profile.observer_height_m
    sun, earth = eph.tracks(kernel_dir, profile.latitude, profile.longitude_east, height, first_start, stop, step, ("SUN", "EARTH"))
    lit = ha.disk_visible_fractions(profile, sun.azimuth_deg, sun.elevation_deg, sun.angular_radius_deg) > 0
    view = ha.disk_visible_fractions(profile, earth.azimuth_deg, earth.elevation_deg, earth.angular_radius_deg) >= EARTH_VISIBLE_MIN_FRACTION
    step_h = step.total_seconds() / 3600.0
    days = []
    for d in range(n_days):
        sl = slice(d * per_day, d * per_day + per_window + 1)
        l, v = lit[sl], view[sl]
        days.append({"start_utc": sun.times_utc[d * per_day], "sun_lit": float(l.mean()),
                     "sun_dark_h": _longest_hidden_hours(l, step_h), "earth_view": float(v.mean()),
                     "earth_gap_h": _longest_hidden_hours(v, step_h), "both": float((l & v).mean()),
                     "sunlit_at_landing": bool(l[0]), "earth_at_landing": bool(v[0])})
    return {"days": days, "n_samples": n, "step_minutes": step.total_seconds() / 60.0}


def analyse(profile: ha.HorizonProfile, kernel_dir, start: datetime, stop: datetime, step: timedelta) -> dict:
    n = int((stop - start) / step) + 1
    if n > MAX_SAMPLES:
        raise ValueError(f"{n} samples requested; the limit is {MAX_SAMPLES}. Use a larger step or shorter window.")
    height = profile.ground_elevation_m + profile.observer_height_m
    sun, earth = eph.tracks(kernel_dir, profile.latitude, profile.longitude_east, height, start, stop, step, ("SUN", "EARTH"))
    step_h = step.total_seconds() / 3600.0
    times = sun.times_utc

    f_sun = ha.disk_visible_fractions(profile, sun.azimuth_deg, sun.elevation_deg, sun.angular_radius_deg)
    f_earth = ha.disk_visible_fractions(profile, earth.azimuth_deg, earth.elevation_deg, earth.angular_radius_deg)
    lit, in_view = f_sun > 0, f_earth >= EARTH_VISIBLE_MIN_FRACTION
    hz_sun, hz_earth = ha.horizon_at(profile, sun.azimuth_deg), ha.horizon_at(profile, earth.azimuth_deg)

    # Were the rays that matter (towards where the Sun / Earth actually were) truncated by the tile edge?
    def truncated_share(az: np.ndarray) -> float:
        idx = np.round(np.asarray(az) / (360.0 / len(profile.azimuth_true_deg))).astype(int) % len(profile.azimuth_true_deg)
        return float(profile.incomplete[idx].mean())

    r = lambda a, d=3: [round(float(v), d) for v in a]
    return {
        "start_utc": times[0], "stop_utc": times[-1], "step_minutes": step.total_seconds() / 60.0, "n_samples": n,
        "sun": _body_summary(lit, f_sun, sun.elevation_deg, times, step_h, "sunrise", "sunset"),
        "earth": _body_summary(in_view, f_earth, earth.elevation_deg, times, step_h, "earthrise", "earthset"),
        "both_fraction_of_time": float((lit & in_view).mean()),
        "neither_fraction_of_time": float((~lit & ~in_view).mean()),
        "sun_rays_truncated_share": truncated_share(sun.azimuth_deg),
        "earth_rays_truncated_share": truncated_share(earth.azimuth_deg),
        "series": {
            "times_utc": times,
            "sun_azimuth_deg": r(sun.azimuth_deg), "sun_elevation_deg": r(sun.elevation_deg), "sun_horizon_deg": r(hz_sun),
            "sun_visible_fraction": r(f_sun), "earth_azimuth_deg": r(earth.azimuth_deg), "earth_elevation_deg": r(earth.elevation_deg),
            "earth_horizon_deg": r(hz_earth), "earth_visible_fraction": r(f_earth),
        },
    }
