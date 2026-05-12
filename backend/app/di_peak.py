from __future__ import annotations

from typing import Iterable, Optional

from .pivots import cluster_levels


DI_PEAK_WINDOW_DEFAULT = 120
DI_PEAK_PROX_PCT = 0.03

# Backward-compatible names for older callers/config. Option 1 interprets this
# value as proximity to a DI pivot zone, not as a rolling-max ratio.
DI_PEAK_RATIO_THRESHOLD = DI_PEAK_PROX_PCT
DI_PEAK_MIN_DI = 0.0
DI_PEAK_SUSTAIN_BARS = 1


def compute_di_peak_flags(
    di_series: Iterable[Optional[float]],
    window: int = DI_PEAK_WINDOW_DEFAULT,
    ratio_threshold: float = DI_PEAK_RATIO_THRESHOLD,
    min_di: float = DI_PEAK_MIN_DI,
    sustain_bars: int = DI_PEAK_SUSTAIN_BARS,
    proximity_pct: Optional[float] = None,
) -> dict:
    if window < 1:
        raise ValueError("window must be >= 1")
    if sustain_bars < 1:
        raise ValueError("sustain_bars must be >= 1")

    series = list(di_series)
    if not series:
        return _empty_result(proximity_pct if proximity_pct is not None else ratio_threshold)

    prox = ratio_threshold if proximity_pct is None else proximity_pct
    if prox <= 0:
        raise ValueError("proximity_pct must be > 0")

    last = series[-1]
    start_idx = max(0, len(series) - window)
    window_slice = series[start_idx:]
    pivot_flags = _find_di_pivot_highs(window_slice, left=2, right=2)

    pivot_indices: list[int] = []
    pivot_values: list[float] = []
    for local_idx, is_pivot in enumerate(pivot_flags):
        if not is_pivot:
            continue
        value = window_slice[local_idx]
        if value is None or value < min_di:
            continue
        pivot_indices.append(start_idx + local_idx)
        pivot_values.append(float(value))

    zones = cluster_levels(pivot_values, prox) if pivot_values else []
    nearest_zone = _nearest_zone(last, zones)
    peak = nearest_zone["center"] if nearest_zone else None
    distance_pct = _distance_pct(last, nearest_zone)
    ratio = None
    if last is not None and peak not in (None, 0):
        ratio = last / peak
    in_peak_zone = distance_pct is not None and distance_pct <= prox

    return {
        "last": last,
        "peak": peak,
        "ratio": ratio,
        "in_peak_zone": in_peak_zone,
        "is_peak": in_peak_zone,
        "zones": zones,
        "nearest_zone": nearest_zone,
        "distance_pct": distance_pct,
        "proximity_pct": prox,
        "pivot_indices": pivot_indices,
        "pivot_values": pivot_values,
    }


def _find_di_pivot_highs(series: list[Optional[float]], left: int = 2, right: int = 2) -> list[bool]:
    size = len(series)
    result = [False] * size
    for idx in range(size):
        if idx - left < 0 or idx + right >= size:
            continue
        current = series[idx]
        if current is None:
            continue
        left_window = series[idx - left : idx]
        right_window = series[idx + 1 : idx + right + 1]
        if any(value is None for value in left_window + right_window):
            continue
        if all(current > value for value in left_window) and all(current >= value for value in right_window):
            result[idx] = True
    return result


def _nearest_zone(last: Optional[float], zones: list[dict]) -> dict | None:
    if last is None or not zones:
        return None
    return min(zones, key=lambda zone: _distance_pct(last, zone) if _distance_pct(last, zone) is not None else float("inf"))


def _distance_pct(last: Optional[float], zone: dict | None) -> float | None:
    if last is None or not zone:
        return None
    center = zone.get("center")
    if center is None:
        return None
    if center == 0:
        return 0.0 if last == 0 else None
    return abs(last - center) / abs(center)


def _empty_result(proximity_pct: float) -> dict:
    return {
        "last": None,
        "peak": None,
        "ratio": None,
        "in_peak_zone": False,
        "is_peak": False,
        "zones": [],
        "nearest_zone": None,
        "distance_pct": None,
        "proximity_pct": proximity_pct,
        "pivot_indices": [],
        "pivot_values": [],
    }
