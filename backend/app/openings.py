from __future__ import annotations

from .di_peak import DI_PEAK_WINDOW_DEFAULT, compute_di_peak_flags
from .indicators import sma
from .level_events import detect_level_events
from .levels import HTF_TFS, apply_overrides, build_levels_detailed, compute_levels, level_roles_from_details
from .rsi_filters import atr_multiplier_from_rsi, rsi_distance_from_50
from .signal_builder import build_signals_from_state
from .setup_candles import detect_setup_candles
from .timeframe_bias import compute_signal_timeframe_bias
from .volume_filters import compute_pullback_vol_decline, compute_vol_metrics


def build_openings(ingest, config, symbol: str, tf: str, limit: int = 300) -> dict:
    symbol_upper = symbol.upper()
    cache = ingest.get_cache(symbol_upper, tf)
    if cache is None:
        raise ValueError("Symbol or timeframe not tracked")
    candles = cache.list_recent(limit)
    last_candle_time = candles[-1].close_time if candles else None

    if not candles:
        return {
            "symbol": symbol_upper,
            "tf": tf,
            "last_candle_time": None,
            "signals": [],
        }
    signal_tf_bias = compute_signal_timeframe_bias(candles)

    indicator_data = ingest.list_indicators(symbol_upper, tf, limit=len(candles))
    rsi_series = indicator_data.get("rsi14", [])
    atr_series = indicator_data.get("atr5", [])
    di_plus = indicator_data.get("di_plus", [])
    di_minus = indicator_data.get("di_minus", [])
    closes = [candle.close for candle in candles]
    sma7 = indicator_data.get("sma7")
    if sma7 is None:
        sma7 = sma(closes, 7)
    sma25 = indicator_data.get("sma25")
    if sma25 is None:
        sma25 = sma(closes, 25)
    sma99 = indicator_data.get("sma99")
    if sma99 is None:
        sma99 = sma(closes, 99)

    symbol_config = next(
        (item for item in config.symbols if item.symbol.upper() == symbol_upper),
        None,
    )
    if symbol_config is None:
        raise ValueError("Symbol not found in watchlist")
    rules = symbol_config.rules.model_dump()
    setups = symbol_config.setups.model_dump()

    di_plus_flags = compute_di_peak_flags(di_plus, window=DI_PEAK_WINDOW_DEFAULT)
    di_minus_flags = compute_di_peak_flags(di_minus, window=DI_PEAK_WINDOW_DEFAULT)
    not_at_peak_long = not di_plus_flags["is_peak"]
    not_at_peak_short = not di_minus_flags["is_peak"]

    volumes = [candle.volume for candle in candles]
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
        "signal_tf_bias": signal_tf_bias,
        "rules": rules,
        "setups": setups,
    }

    candles_by_tf = {}
    for htf in HTF_TFS:
        htf_cache = ingest.get_cache(symbol_upper, htf)
        candles_by_tf[htf] = htf_cache.list_all() if htf_cache else []
    detected_levels, _, clusters, meta = compute_levels(
        candles_by_tf,
        entry_tf=tf,
        htf_timeframe=symbol_config.levels.htf_timeframe,
        lookback=symbol_config.levels.lookback_window,
    )
    tol_pct_used = meta.get("tol_pct_used")
    overrides = symbol_config.levels.overrides
    merged = apply_overrides(detected_levels, overrides.add, overrides.disable, tol_pct_used)
    final_levels = merged["final_levels"]
    final_levels_detailed = build_levels_detailed(
        final_levels,
        clusters,
        meta.get("last_close_used"),
        tol_pct_used,
    )
    level_roles = level_roles_from_details(final_levels_detailed)
    context.update(
        {
            "sr_algorithm": meta.get("algorithm"),
            "sr_entry_tf": tf,
            "sr_htf_timeframe": meta.get("htf_timeframe"),
            "sr_lookback": meta.get("lookback"),
            "active_support": meta.get("support"),
            "active_resistance": meta.get("resistance"),
        }
    )

    fakeout_volume_series = None
    if not symbol_config.rules.fakeout_volume_filter:
        fakeout_volume_series = [True] * len(candles)
    events = detect_level_events(candles, final_levels, slope_ok_series=fakeout_volume_series, level_roles=level_roles)
    setup_items = detect_setup_candles(candles, sma7, sma25, sma99, events, sl_buffer_pct=0.0015)

    signals = build_signals_from_state(
        candles,
        events,
        setup_items,
        context,
        atr_stop_distance,
    )

    return {
        "symbol": symbol_upper,
        "tf": tf,
        "last_candle_time": last_candle_time,
        "signals": signals,
    }

