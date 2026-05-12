from __future__ import annotations

from typing import List, Optional

from .candle_cache import Candle


WICK_BODY_RATIO_MIN = 1.5


def detect_setup_candles(
    candles: List[Candle],
    sma7: List[Optional[float]],
    sma25: List[Optional[float]],
    sma99: List[Optional[float]],
    level_events: List[dict],
    sl_buffer_pct: float = 0.0015,
    wick_body_ratio_min: float = WICK_BODY_RATIO_MIN,
) -> List[dict]:
    items: List[dict] = []
    if not candles:
        return items
    if wick_body_ratio_min <= 0:
        raise ValueError("wick_body_ratio_min must be > 0")

    for event in level_events:
        level = event.get("level")
        direction = event.get("direction")
        last_break = event.get("last_break")
        retest_index = event.get("retest_index")
        last_fakeout = event.get("last_fakeout")

        if level is None or direction is None:
            continue
        if not last_break or retest_index is None:
            continue
        if last_fakeout and last_fakeout.get("index", -1) > last_break.get("index", -1):
            continue

        last_setup = None
        start_idx = retest_index + 1
        for idx in range(start_idx, len(candles)):
            if not _moving_averages_ready(idx, sma7, sma25, sma99):
                continue

            candle = candles[idx]
            if direction == "up":
                if candle.close <= level:
                    continue
                if not _is_long_setup_candle(candle, sma7[idx], wick_body_ratio_min):
                    continue
                entry = candle.close
                sl = candle.low * (1 - sl_buffer_pct)
                last_setup = _setup_payload(
                    level,
                    "long",
                    idx,
                    candle,
                    entry,
                    sl,
                    sma7[idx],
                    sma25[idx],
                    sma99[idx],
                    wick_body_ratio_min,
                    last_break,
                    retest_index,
                    last_fakeout,
                )
            elif direction == "down":
                if candle.close >= level:
                    continue
                if not _is_short_setup_candle(candle, sma7[idx], wick_body_ratio_min):
                    continue
                entry = candle.close
                sl = candle.high * (1 + sl_buffer_pct)
                last_setup = _setup_payload(
                    level,
                    "short",
                    idx,
                    candle,
                    entry,
                    sl,
                    sma7[idx],
                    sma25[idx],
                    sma99[idx],
                    wick_body_ratio_min,
                    last_break,
                    retest_index,
                    last_fakeout,
                )

        if last_setup:
            items.append(last_setup)

    return items


def _moving_averages_ready(
    idx: int,
    sma7: List[Optional[float]],
    sma25: List[Optional[float]],
    sma99: List[Optional[float]],
) -> bool:
    return (
        idx < len(sma7)
        and idx < len(sma25)
        and idx < len(sma99)
        and sma7[idx] is not None
        and sma25[idx] is not None
        and sma99[idx] is not None
    )


def _is_long_setup_candle(candle: Candle, sma7_value: Optional[float], wick_body_ratio_min: float) -> bool:
    if sma7_value is None or candle.close <= candle.open:
        return False
    body_low = min(candle.open, candle.close)
    lower_wick = body_low - candle.low
    body = abs(candle.close - candle.open)
    return body > 0 and lower_wick >= body * wick_body_ratio_min and sma7_value <= body_low


def _is_short_setup_candle(candle: Candle, sma7_value: Optional[float], wick_body_ratio_min: float) -> bool:
    if sma7_value is None or candle.close >= candle.open:
        return False
    body_high = max(candle.open, candle.close)
    upper_wick = candle.high - body_high
    body = abs(candle.close - candle.open)
    return body > 0 and upper_wick >= body * wick_body_ratio_min and sma7_value >= body_high


def _setup_payload(
    level: float,
    direction: str,
    idx: int,
    candle: Candle,
    entry: float,
    sl: float,
    sma7_value: float,
    sma25_value: float,
    sma99_value: float,
    wick_body_ratio_min: float,
    last_break: dict,
    retest_index: int,
    last_fakeout: dict | None,
) -> dict:
    body = abs(candle.close - candle.open)
    lower_wick = min(candle.open, candle.close) - candle.low
    upper_wick = candle.high - max(candle.open, candle.close)
    directional_wick = lower_wick if direction == "long" else upper_wick
    wick_body_ratio = directional_wick / body if body else None
    return {
        "level": level,
        "direction": direction,
        "setup_index": idx,
        "time": candle.close_time,
        "entry": entry,
        "sl": sl,
        "sma7": sma7_value,
        "sma25": sma25_value,
        "sma99": sma99_value,
        "body": body,
        "directional_wick": directional_wick,
        "wick_body_ratio": wick_body_ratio,
        "wick_body_ratio_min": wick_body_ratio_min,
        "level_event": {
            "break_index": last_break.get("index") if last_break else None,
            "retest_index": retest_index,
            "fakeout_index": last_fakeout.get("index") if last_fakeout else None,
        },
    }
