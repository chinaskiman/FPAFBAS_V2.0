from __future__ import annotations

from typing import List, Optional

from .candle_cache import Candle


def build_signals_from_state(
    candles: List[Candle],
    events: List[dict],
    setup_items: List[dict],
    context: dict,
    atr_stop_distance: Optional[float],
) -> List[dict]:
    last_candle_time = candles[-1].close_time if candles else None
    if not candles:
        return []

    signals: List[dict] = []
    break_levels = set()
    setups = context.get("setups") or {}
    rules = context.get("rules") or {}
    for event in events:
        if not setups.get("continuation", True):
            continue
        last_break = event.get("last_break")
        if not last_break or last_break.get("time") != last_candle_time:
            continue
        if event.get("direction") == "up":
            direction = "long"
        elif event.get("direction") == "down":
            direction = "short"
        else:
            continue
        if rules.get("hwc_filter", True) and not _direction_allowed_by_hwc(direction, context):
            continue
        if rules.get("volume_spike_filter", True) and not context.get("volume_spike_ok"):
            continue
        di_ok = context.get("not_at_peak_long") if direction == "long" else context.get("not_at_peak_short")
        if rules.get("di_peak_filter", True) and not di_ok:
            continue
        break_index = last_break.get("index")
        candle = candles[break_index] if break_index is not None and break_index < len(candles) else None
        entry = last_break["close"]
        sl = None
        if atr_stop_distance is not None:
            sl = entry - atr_stop_distance if direction == "long" else entry + atr_stop_distance
        signals.append(
            _signal_payload(
                {
                    "type": "break",
                    "level": event.get("level"),
                    "direction": direction,
                    "time": last_break["time"],
                    "entry": entry,
                    "sl": sl,
                    "sl_reason": "atr_stop",
                },
                candle,
                {
                    "break_index": break_index,
                    "retest_index": event.get("retest_index"),
                    "fakeout_index": event.get("last_fakeout", {}).get("index") if event.get("last_fakeout") else None,
                },
                None,
                context,
            )
        )
        break_levels.add(event.get("level"))

    for event in events:
        if not setups.get("retest", True):
            continue
        if event.get("retest_time") != last_candle_time:
            continue
        if event.get("last_fakeout"):
            continue
        if event.get("direction") == "up":
            direction = "long"
        elif event.get("direction") == "down":
            direction = "short"
        else:
            continue
        if rules.get("hwc_filter", True) and not _direction_allowed_by_hwc(direction, context):
            continue
        if rules.get("pullback_volume_filter", True) and not context.get("pullback_vol_decline"):
            continue
        retest_index = event.get("retest_index")
        if retest_index is None or retest_index < 0 or retest_index >= len(candles):
            continue
        candle = candles[retest_index]
        level = event.get("level")
        if level is None:
            continue
        if direction == "long":
            if not (candle.low <= level and candle.close > level):
                continue
            sl = candle.low * (1 - 0.0015)
        else:
            if not (candle.high >= level and candle.close < level):
                continue
            sl = candle.high * (1 + 0.0015)
        signals.append(
            _signal_payload(
                {
                    "type": "retest",
                    "level": level,
                    "direction": direction,
                    "time": event.get("retest_time"),
                    "entry": candle.close,
                    "sl": sl,
                    "sl_reason": "retest_extreme",
                },
                candle,
                {
                    "break_index": event.get("last_break", {}).get("index") if event.get("last_break") else None,
                    "retest_index": retest_index,
                    "fakeout_index": event.get("last_fakeout", {}).get("index") if event.get("last_fakeout") else None,
                },
                None,
                context,
            )
        )

    for item in setup_items:
        if not setups.get("setup_candle", True):
            continue
        if item.get("time") != last_candle_time:
            continue
        if item.get("level") in break_levels:
            continue
        direction = item.get("direction")
        if rules.get("hwc_filter", True) and not _direction_allowed_by_hwc(direction, context):
            continue
        if rules.get("pullback_volume_filter", True) and not context.get("pullback_vol_decline"):
            continue
        setup_index = item.get("setup_index")
        candle = candles[setup_index] if setup_index is not None and setup_index < len(candles) else None
        level_event = item.get("level_event") or {}
        signals.append(
            _signal_payload(
                {
                    "type": "setup",
                    "level": item.get("level"),
                    "direction": direction,
                    "time": item.get("time"),
                    "entry": item.get("entry"),
                    "sl": item.get("sl"),
                    "sl_reason": "setup_candle",
                },
                candle,
                {
                    "break_index": level_event.get("break_index"),
                    "retest_index": level_event.get("retest_index"),
                    "fakeout_index": level_event.get("fakeout_index"),
                },
                setup_index,
                context,
            )
        )

    for event in events:
        if not setups.get("fakeout", True):
            continue
        last_fakeout = event.get("last_fakeout")
        if not last_fakeout or last_fakeout.get("time") != last_candle_time:
            continue
        break_direction = event.get("direction")
        if break_direction == "up":
            direction = "short"
        elif break_direction == "down":
            direction = "long"
        else:
            continue
        if rules.get("hwc_filter", True) and not _direction_allowed_by_hwc(direction, context):
            continue
        idx = last_fakeout.get("index")
        if idx is None or idx >= len(candles):
            continue
        candle = candles[idx]
        if direction == "short":
            sl = candle.high * (1 + 0.0015)
        else:
            sl = candle.low * (1 - 0.0015)
        signals.append(
            _signal_payload(
                {
                    "type": "fakeout",
                    "level": event.get("level"),
                    "direction": direction,
                    "time": last_fakeout.get("time"),
                    "entry": last_fakeout.get("close"),
                    "sl": sl,
                    "sl_reason": "fakeout_extreme",
                },
                candle,
                {
                    "break_index": event.get("last_break", {}).get("index") if event.get("last_break") else None,
                    "retest_index": event.get("retest_index"),
                    "fakeout_index": idx,
                },
                None,
                context,
            )
        )

    return signals


def _direction_allowed_by_hwc(direction: str | None, context: dict) -> bool:
    hwc_bias = context.get("hwc_bias")
    if direction == "long":
        return hwc_bias == "bullish"
    if direction == "short":
        return hwc_bias == "bearish"
    return False


def _signal_payload(
    base: dict,
    candle: Optional[Candle],
    level_event: dict,
    setup_index: Optional[int],
    context: dict,
) -> dict:
    trigger = None
    if candle is not None:
        trigger = {
            "open": candle.open,
            "high": candle.high,
            "low": candle.low,
            "close": candle.close,
            "volume": candle.volume,
        }
    return {
        **base,
        "candle": candle.to_dict() if candle else None,
        "level_event": level_event,
        "context": context,
        "trigger_candle": trigger,
        "level_event_indices": level_event,
        "setup_index": setup_index,
    }
