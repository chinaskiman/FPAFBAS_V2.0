from __future__ import annotations

from typing import Iterable, List, Optional

from .candle_cache import Candle
from .indicators import sma


def compute_vol_ma5_slope_pct_series(volumes: Iterable[float], window: int = 5) -> List[Optional[float]]:
    series = list(volumes)
    vol_ma5 = sma(series, window)
    slope_pct: List[Optional[float]] = [None] * len(vol_ma5)
    for idx in range(len(vol_ma5)):
        if idx - 5 < 0:
            continue
        current = vol_ma5[idx]
        prev = vol_ma5[idx - 5]
        if current is None or prev in (None, 0):
            continue
        slope_pct[idx] = ((current - prev) / prev) * 100
    return slope_pct


def compute_fakeout_volume_ok_series(volumes: Iterable[float], window: int = 10) -> List[bool]:
    series = list(volumes)
    vol_ma = sma(series, window)
    result = [False] * len(series)
    for idx, volume in enumerate(series):
        if idx == 0 or idx >= len(vol_ma):
            continue
        ma_value = vol_ma[idx]
        if ma_value is None:
            continue
        result[idx] = volume > series[idx - 1] and volume > ma_value
    return result


def detect_level_events(
    candles: List[Candle],
    levels: Iterable[float],
    slope_ok_series: Optional[List[Optional[bool]]] = None,
    level_roles: Optional[dict[float, str]] = None,
    max_retest_bars: int = 20,
    max_fakeout_bars: int = 10,
) -> List[dict]:
    if not candles:
        return []
    levels_list = list(levels)
    volumes = [candle.volume for candle in candles]
    if slope_ok_series is None:
        slope_ok_series = compute_fakeout_volume_ok_series(volumes)

    events: List[dict] = []

    for level in levels_list:
        role = _role_for_level(level, level_roles)
        allow_break_up = role in (None, "resistance", "mixed")
        allow_break_down = role in (None, "support", "mixed")
        last_break = None
        direction = None
        break_index = None
        retest_touched = False
        retest_index = None
        retest_time = None
        last_fakeout = None

        for idx in range(1, len(candles)):
            prev_close = candles[idx - 1].close
            close = candles[idx].close
            low = candles[idx].low
            high = candles[idx].high
            close_time = candles[idx].close_time
            slope_ok = slope_ok_series[idx] if idx < len(slope_ok_series) else False

            if break_index is not None and not retest_touched:
                if idx - break_index > max_retest_bars:
                    last_break = None
                    direction = None
                    break_index = None
                    retest_touched = False
                    retest_index = None
                    retest_time = None
                    last_fakeout = None

            if retest_touched and retest_index is not None:
                if idx - retest_index > max_fakeout_bars and last_fakeout is None:
                    last_break = None
                    direction = None
                    break_index = None
                    retest_touched = False
                    retest_index = None
                    retest_time = None
                    last_fakeout = None
                elif 1 <= idx - retest_index <= max_fakeout_bars and slope_ok:
                    if direction == "up" and close < level and high >= level:
                        last_fakeout = {"index": idx, "time": close_time, "close": close}
                        continue
                    if direction == "down" and close > level and low <= level:
                        last_fakeout = {"index": idx, "time": close_time, "close": close}
                        continue

            if allow_break_up and prev_close <= level and close > level:
                last_break = {"index": idx, "time": close_time, "close": close}
                direction = "up"
                break_index = idx
                retest_touched = False
                retest_index = None
                retest_time = None
                last_fakeout = None
                continue

            if allow_break_down and prev_close >= level and close < level:
                last_break = {"index": idx, "time": close_time, "close": close}
                direction = "down"
                break_index = idx
                retest_touched = False
                retest_index = None
                retest_time = None
                last_fakeout = None
                continue

            if last_break is None:
                continue

            if not retest_touched:
                if direction == "up" and low <= level:
                    retest_touched = True
                    retest_index = idx
                    retest_time = close_time
                elif direction == "down" and high >= level:
                    retest_touched = True
                    retest_index = idx
                    retest_time = close_time
                continue

        events.append(
            {
                "level": level,
                "role": role,
                "direction": direction,
                "last_break": last_break,
                "retest_touched": retest_touched,
                "retest_index": retest_index,
                "retest_time": retest_time,
                "last_fakeout": last_fakeout,
            }
        )

    return events


def _role_for_level(level: float, roles: Optional[dict[float, str]]) -> Optional[str]:
    if not roles:
        return None
    if level in roles:
        return roles[level]
    for ref, role in roles.items():
        if ref == 0 and level == 0:
            return role
        if ref and abs(level - ref) / abs(ref) <= 1e-12:
            return role
    return None
