from __future__ import annotations

import bisect
import time
from typing import Any, Dict, List

from .candle_cache import Candle
from .di_peak import DI_PEAK_WINDOW_DEFAULT, compute_di_peak_flags
from .hwc import compute_hwc_bias, compute_mwc_bias
from .indicators import atr, dmi_adx, rsi, sma
from .level_events import detect_level_events
from .levels import HTF_TFS, apply_overrides, compute_levels
from .quality_controls import score_signal
from .rsi_filters import atr_multiplier_from_rsi, rsi_distance_from_50
from .signal_builder import build_signals_from_state
from .setup_candles import detect_setup_candles
from .volume_filters import compute_pullback_vol_decline, compute_vol_metrics


def replay_run(
    ingest,
    config,
    symbol: str,
    tf: str,
    from_ms: int,
    to_ms: int,
    step: int = 1,
    warmup: int = 300,
    include_debug: bool = False,
) -> dict:
    symbol_upper = symbol.upper()
    cache = ingest.get_cache(symbol_upper, tf)
    if cache is None:
        raise ValueError("Symbol or timeframe not tracked")
    all_candles = cache.list_all()
    if not all_candles:
        return _empty_replay(symbol_upper, tf, from_ms, to_ms, step)

    times = [candle.close_time for candle in all_candles]
    start_idx = bisect.bisect_left(times, from_ms)
    end_idx = bisect.bisect_right(times, to_ms) - 1
    if start_idx >= len(all_candles) or end_idx < start_idx:
        return _empty_replay(symbol_upper, tf, from_ms, to_ms, step)

    warmup_start = max(0, start_idx - max(warmup, 0))
    candles = all_candles[warmup_start : end_idx + 1]
    start_offset = start_idx - warmup_start

    htf_all: Dict[str, List[Candle]] = {}
    htf_times: Dict[str, List[int]] = {}
    for htf in HTF_TFS:
        htf_cache = ingest.get_cache(symbol_upper, htf)
        series = htf_cache.list_all() if htf_cache else []
        htf_all[htf] = series
        htf_times[htf] = [candle.close_time for candle in series]

    symbol_config = next(
        (item for item in config.symbols if item.symbol.upper() == symbol_upper),
        None,
    )
    if symbol_config is None:
        raise ValueError("Symbol not found in watchlist")
    rules = symbol_config.rules.model_dump()
    setups = symbol_config.setups.model_dump()

    items: List[dict] = []
    step_size = max(step, 1)
    for idx in range(start_offset, len(candles)):
        window = candles[: idx + 1]
        last = window[-1]
        last_time = last.close_time

        candles_by_tf = {}
        for htf, series in htf_all.items():
            if not series:
                candles_by_tf[htf] = []
                continue
            end = bisect.bisect_right(htf_times[htf], last_time)
            candles_by_tf[htf] = series[:end]

        auto_levels, _selected, _clusters, meta = compute_levels(
            candles_by_tf,
            symbol_config.levels.cluster_tol_pct,
            symbol_config.levels.max_levels,
        )
        tol_pct_used = meta.get("tol_pct_used", symbol_config.levels.cluster_tol_pct)
        overrides = symbol_config.levels.overrides
        merged = apply_overrides(auto_levels, overrides.add, overrides.disable, tol_pct_used)
        final_levels = merged["final_levels"]

        closes = [candle.close for candle in window]
        highs = [candle.high for candle in window]
        lows = [candle.low for candle in window]
        volumes = [candle.volume for candle in window]

        sma7 = sma(closes, 7)
        sma25 = sma(closes, 25)
        sma99 = sma(closes, 99)

        rsi_series = rsi(closes, 14)
        atr_series = atr(highs, lows, closes, 5)
        di_plus, di_minus, adx14 = dmi_adx(highs, lows, closes, 14)

        di_plus_flags = compute_di_peak_flags(di_plus, window=DI_PEAK_WINDOW_DEFAULT)
        di_minus_flags = compute_di_peak_flags(di_minus, window=DI_PEAK_WINDOW_DEFAULT)
        not_at_peak_long = not di_plus_flags["is_peak"]
        not_at_peak_short = not di_minus_flags["is_peak"]

        vol_metrics = compute_vol_metrics(volumes, window_ma=10, window_ma5=5)
        pullback_decline = compute_pullback_vol_decline(volumes, k=3)

        rsi_last = rsi_series[-1] if rsi_series else None
        atr_last = atr_series[-1] if atr_series else None
        rsi_distance = rsi_distance_from_50(rsi_last) if rsi_last is not None else None
        atr_mult_raw = None
        atr_mult = None
        if rsi_last is not None:
            mult = atr_multiplier_from_rsi(rsi_last)
            atr_mult_raw = mult["raw"]
            atr_mult = mult["clamped"]
        atr_stop_distance = atr_last * atr_mult if atr_last is not None and atr_mult is not None else None

        weekly = candles_by_tf.get("1w", [])
        daily = candles_by_tf.get("1d", [])
        four_hour = candles_by_tf.get("4h", [])
        hwc = compute_hwc_bias(weekly, daily)
        mwc = compute_mwc_bias(daily, four_hour)
        hwc_bias = hwc["hwc_bias"]
        weekly_bias = hwc.get("weekly", {}).get("bias")
        daily_bias = hwc.get("daily", {}).get("bias")
        four_hour_bias = mwc.get("four_hour", {}).get("bias")
        mwc_bias = mwc["mwc_bias"]

        context = {
            "vol_ma5_slope_ok": vol_metrics["vol_ma5_slope_ok"],
            "vol_highest10": vol_metrics["vol_highest10"],
            "volume_spike_ok": vol_metrics["vol_highest10"],
            "pullback_vol_decline": pullback_decline,
            "not_at_peak_long": not_at_peak_long,
            "not_at_peak_short": not_at_peak_short,
            "rsi_distance": rsi_distance,
            "atr_mult": atr_mult,
            "atr_stop_distance": atr_stop_distance,
            "hwc_bias": hwc_bias,
            "mwc_bias": mwc_bias,
            "weekly_bias": weekly_bias,
            "daily_bias": daily_bias,
            "four_hour_bias": four_hour_bias,
            "mwc": mwc,
            "rules": rules,
            "setups": setups,
        }

        fakeout_volume_series = None
        if not symbol_config.rules.fakeout_volume_filter:
            fakeout_volume_series = [True] * len(window)
        events = detect_level_events(window, final_levels, slope_ok_series=fakeout_volume_series)
        setup_items = detect_setup_candles(window, sma7, sma25, sma99, events, sl_buffer_pct=0.0015)

        signals = build_signals_from_state(
            window,
            events,
            setup_items,
            context,
            atr_stop_distance,
        )

        item = {
            "index": idx,
            "time": last_time,
            "candle": {
                "open": last.open,
                "high": last.high,
                "low": last.low,
                "close": last.close,
                "volume": last.volume,
            },
            "levels": final_levels,
            "tol_pct_used": tol_pct_used,
            "level_events": events,
            "setup_candles": setup_items,
            "signals": signals,
            "hwc_bias": hwc_bias,
            "mwc_bias": mwc_bias,
            "weekly_bias": weekly_bias,
            "daily_bias": daily_bias,
            "four_hour_bias": four_hour_bias,
            "filters": {
                "vol_ok": vol_metrics["vol_ma5_slope_ok"],
                "volume_spike_ok": vol_metrics["vol_highest10"],
                "di_ok": not_at_peak_long and not_at_peak_short,
                "rsi_ok": rsi_distance is not None,
                "atr_ok": atr_stop_distance is not None,
            },
        }
        should_sample = ((idx - start_offset) % step_size) == 0
        is_last = idx == len(candles) - 1
        if should_sample or signals or is_last:
            items.append(item)

    return {
        "symbol": symbol_upper,
        "tf": tf,
        "from_ms": from_ms,
        "to_ms": to_ms,
        "step": step,
        "items": items,
        "last_candle_time": items[-1]["time"] if items else None,
        "timestamp": int(time.time() * 1000),
    }


def replay_summary(result: dict) -> dict:
    items = result.get("items", [])
    total_steps = len(items)
    signals_total = 0
    by_type = {"break": 0, "retest": 0, "setup": 0, "fakeout": 0}
    by_direction = {"long": 0, "short": 0}
    filter_pass = {"vol_ok_true": 0, "di_ok_true": 0, "rsi_ok_true": 0, "atr_ok_true": 0}
    by_day: Dict[str, int] = {}

    for item in items:
        filters = item.get("filters") or {}
        if filters.get("vol_ok"):
            filter_pass["vol_ok_true"] += 1
        if filters.get("di_ok"):
            filter_pass["di_ok_true"] += 1
        if filters.get("rsi_ok"):
            filter_pass["rsi_ok_true"] += 1
        if filters.get("atr_ok"):
            filter_pass["atr_ok_true"] += 1

        for signal in item.get("signals", []):
            signals_total += 1
            signal_type = signal.get("type")
            if signal_type in by_type:
                by_type[signal_type] += 1
            direction = signal.get("direction")
            if direction in by_direction:
                by_direction[direction] += 1
            time_ms = signal.get("time")
            if time_ms:
                day = time.strftime("%Y-%m-%d", time.gmtime(time_ms / 1000))
                by_day[day] = by_day.get(day, 0) + 1

    return {
        "total_steps": total_steps,
        "signals_total": signals_total,
        "by_type": by_type,
        "by_direction": by_direction,
        "filter_pass": filter_pass,
        "by_day": [{"day": day, "signals": count} for day, count in sorted(by_day.items())],
        "performance": replay_performance_report(result),
    }


def replay_performance_report(result: dict) -> dict:
    trades = replay_trade_outcomes(result)
    summary = _empty_performance_summary()
    groups = {
        "by_type": {},
        "by_symbol": {},
        "by_tf": {},
        "by_direction": {},
        "by_hwc": {},
        "by_mwc": {},
        "by_quality": {},
    }
    for trade in trades:
        _accumulate(summary, trade)
        for group_name, key_name in (
            ("by_type", "type"),
            ("by_symbol", "symbol"),
            ("by_tf", "tf"),
            ("by_direction", "direction"),
            ("by_hwc", "hwc_bias"),
            ("by_mwc", "mwc_bias"),
            ("by_quality", "quality_grade"),
        ):
            key = str(trade.get(key_name) or "-")
            bucket = groups[group_name].setdefault(key, _empty_performance_summary())
            _accumulate(bucket, trade)

    return {
        **_finalize_summary(summary),
        "sample_warning": result.get("step", 1) != 1,
        "trade_rows": trades,
        "groups": {
            group_name: [
                {"key": key, **_finalize_summary(bucket)}
                for key, bucket in sorted(group.items(), key=lambda item: item[0])
            ]
            for group_name, group in groups.items()
        },
    }


def replay_trade_outcomes(result: dict) -> List[dict]:
    items = result.get("items") or []
    candles = _replay_candle_rows(items)
    rows: List[dict] = []
    symbol = result.get("symbol") or "-"
    tf = result.get("tf") or "-"
    for item_idx, item in enumerate(items):
        signals = item.get("signals") or []
        for signal_idx, signal in enumerate(signals):
            outcome = _evaluate_signal_outcome(signal, candles)
            if outcome is None:
                continue
            direction = str(signal.get("direction") or "").lower()
            context = signal.get("context") or {}
            alignment = _bias_alignment(direction, context)
            score, badges, reasons = score_signal(signal)
            grade = _quality_grade(score, alignment["bias_alignment_count"])
            signal_time = _to_float(signal.get("time") or item.get("time"))
            rows.append(
                {
                    "id": f"{symbol}-{tf}-{item_idx}-{signal_idx}-{int(signal_time or 0)}",
                    "symbol": symbol,
                    "tf": tf,
                    "type": signal.get("type") or "-",
                    "direction": direction,
                    "signal_time": signal_time,
                    "entry": _to_float(signal.get("entry")),
                    "sl": _to_float(signal.get("sl")),
                    "risk": outcome["risk"],
                    "quality_score": score,
                    "quality_grade": grade,
                    "quality_badges": badges,
                    "quality_reasons": reasons,
                    **alignment,
                    **outcome,
                }
            )
    return rows


def _evaluate_signal_outcome(signal: dict, candles: List[dict]) -> dict | None:
    entry = _to_float(signal.get("entry"))
    sl = _to_float(signal.get("sl"))
    signal_time = _to_float(signal.get("time"))
    direction = str(signal.get("direction") or "").lower()
    if entry is None or sl is None or signal_time is None or direction not in {"long", "short"}:
        return None
    risk = abs(entry - sl)
    if risk <= 0:
        return None

    rr2_target = entry + risk * 2 if direction == "long" else entry - risk * 2
    rr5_target = entry + risk * 5 if direction == "long" else entry - risk * 5
    rr10_target = entry + risk * 10 if direction == "long" else entry - risk * 10

    max_rr = 0.0
    max_drawdown_r = 0.0
    outcome = "open"
    outcome_time = None
    outcome_idx = -1
    rr5_time = None
    rr10_time = None

    for idx, candle in enumerate(candles):
        candle_time = candle.get("time")
        if candle_time is None or candle_time <= signal_time:
            continue
        high = candle.get("high")
        low = candle.get("low")
        if high is None or low is None:
            continue

        if direction == "long":
            favorable_r = max(0.0, (high - entry) / risk)
            adverse_r = max(0.0, (entry - low) / risk)
            sl_hit = low <= sl
            rr2_hit = high >= rr2_target
            rr5_hit = high >= rr5_target
            rr10_hit = high >= rr10_target
        else:
            favorable_r = max(0.0, (entry - low) / risk)
            adverse_r = max(0.0, (high - entry) / risk)
            sl_hit = high >= sl
            rr2_hit = low <= rr2_target
            rr5_hit = low <= rr5_target
            rr10_hit = low <= rr10_target

        if sl_hit:
            outcome = "loss"
            outcome_time = candle_time
            outcome_idx = idx
            max_drawdown_r = max(max_drawdown_r, 1.0)
            break
        if rr2_hit:
            outcome = "win"
            outcome_time = candle_time
            outcome_idx = idx
            max_rr = max(max_rr, 2.0)
            max_drawdown_r = max(max_drawdown_r, min(1.0, adverse_r))
            rr5_time = candle_time if rr5_hit else None
            rr10_time = candle_time if rr10_hit else None
            break
        max_rr = max(max_rr, favorable_r)
        max_drawdown_r = max(max_drawdown_r, adverse_r)

    if outcome == "win" and outcome_idx >= 0:
        for candle in candles[outcome_idx:]:
            candle_time = candle.get("time")
            high = candle.get("high")
            low = candle.get("low")
            if candle_time is None or high is None or low is None:
                continue
            if direction == "long":
                max_rr = max(max_rr, max(0.0, (high - entry) / risk))
                if rr5_time is None and high >= rr5_target:
                    rr5_time = candle_time
                if rr10_time is None and high >= rr10_target:
                    rr10_time = candle_time
            else:
                max_rr = max(max_rr, max(0.0, (entry - low) / risk))
                if rr5_time is None and low <= rr5_target:
                    rr5_time = candle_time
                if rr10_time is None and low <= rr10_target:
                    rr10_time = candle_time
    else:
        rr5_time = None
        rr10_time = None

    sl_time = outcome_time if outcome == "loss" else None
    rr2_time = outcome_time if outcome == "win" else None
    return {
        "outcome": outcome,
        "outcome_time": outcome_time,
        "outcome_duration_ms": _duration(signal_time, outcome_time),
        "time_to_sl_ms": _duration(signal_time, sl_time),
        "time_to_rr2_ms": _duration(signal_time, rr2_time),
        "time_to_rr5_ms": _duration(signal_time, rr5_time),
        "time_to_rr10_ms": _duration(signal_time, rr10_time),
        "max_rr": max(0.0, max_rr),
        "max_drawdown_r": max(0.0, max_drawdown_r),
        "realized_r": 2.0 if outcome == "win" else -1.0 if outcome == "loss" else 0.0,
        "risk": risk,
    }


def _replay_candle_rows(items: List[dict]) -> List[dict]:
    rows = []
    for item in items:
        candle = item.get("candle") or {}
        row = {
            "time": _to_float(item.get("time")),
            "high": _to_float(candle.get("high")),
            "low": _to_float(candle.get("low")),
        }
        if row["time"] is not None and row["high"] is not None and row["low"] is not None:
            rows.append(row)
    return sorted(rows, key=lambda item: item["time"])


def _bias_alignment(direction: str, context: dict) -> dict:
    expected = "bullish" if direction == "long" else "bearish" if direction == "short" else None
    weekly = str(context.get("weekly_bias") or "neutral").lower()
    daily = str(context.get("daily_bias") or "neutral").lower()
    four_hour = str(context.get("four_hour_bias") or "neutral").lower()
    hwc = str(context.get("hwc_bias") or "neutral").lower()
    mwc = str(context.get("mwc_bias") or "neutral").lower()
    values = [weekly, daily, four_hour, hwc, mwc]
    aligned = sum(1 for value in values if expected is not None and value == expected)
    return {
        "weekly_bias": weekly,
        "daily_bias": daily,
        "four_hour_bias": four_hour,
        "hwc_bias": hwc,
        "mwc_bias": mwc,
        "bias_alignment_count": aligned,
        "bias_alignment_label": f"{aligned}/5 aligned",
    }


def _quality_grade(score: int, aligned_count: int) -> str:
    if score >= 75 and aligned_count >= 4:
        return "A"
    if score >= 55 and aligned_count >= 3:
        return "B"
    return "C"


def _empty_performance_summary() -> dict:
    return {
        "trades": 0,
        "wins": 0,
        "losses": 0,
        "open": 0,
        "realized_r_total": 0.0,
        "max_rr_total": 0.0,
        "max_drawdown_r_total": 0.0,
        "best_max_rr": 0.0,
        "worst_drawdown_r": 0.0,
    }


def _accumulate(bucket: dict, trade: dict) -> None:
    bucket["trades"] += 1
    outcome = trade.get("outcome")
    if outcome == "win":
        bucket["wins"] += 1
    elif outcome == "loss":
        bucket["losses"] += 1
    else:
        bucket["open"] += 1
    realized_r = _to_float(trade.get("realized_r")) or 0.0
    max_rr = _to_float(trade.get("max_rr")) or 0.0
    max_drawdown = _to_float(trade.get("max_drawdown_r")) or 0.0
    bucket["realized_r_total"] += realized_r
    bucket["max_rr_total"] += max_rr
    bucket["max_drawdown_r_total"] += max_drawdown
    bucket["best_max_rr"] = max(bucket["best_max_rr"], max_rr)
    bucket["worst_drawdown_r"] = max(bucket["worst_drawdown_r"], max_drawdown)


def _finalize_summary(bucket: dict) -> dict:
    trades = bucket["trades"]
    closed = bucket["wins"] + bucket["losses"]
    return {
        "trades": trades,
        "wins": bucket["wins"],
        "losses": bucket["losses"],
        "open": bucket["open"],
        "win_rate": (bucket["wins"] / closed) if closed else None,
        "realized_r_total": bucket["realized_r_total"],
        "realized_r_avg": (bucket["realized_r_total"] / closed) if closed else None,
        "max_rr_avg": (bucket["max_rr_total"] / trades) if trades else None,
        "max_drawdown_r_avg": (bucket["max_drawdown_r_total"] / trades) if trades else None,
        "best_max_rr": bucket["best_max_rr"],
        "worst_drawdown_r": bucket["worst_drawdown_r"],
    }


def _duration(start: float, end: Any) -> float | None:
    end_num = _to_float(end)
    if end_num is None:
        return None
    return max(0.0, end_num - start)


def _to_float(value: Any) -> float | None:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if num != num:
        return None
    return num


def _empty_replay(symbol: str, tf: str, from_ms: int, to_ms: int, step: int) -> dict:
    return {
        "symbol": symbol,
        "tf": tf,
        "from_ms": from_ms,
        "to_ms": to_ms,
        "step": step,
        "items": [],
        "last_candle_time": None,
        "timestamp": int(time.time() * 1000),
    }
