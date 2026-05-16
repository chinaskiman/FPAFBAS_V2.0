from app.candle_cache import Candle
from app.level_events import detect_level_events
from app.levels import (
    apply_overrides,
    build_levels_detailed,
    compute_levels,
    level_roles_from_details,
    resolve_htf_timeframe,
)


def _candle(idx: int, open_: float, close: float) -> Candle:
    open_time = idx * 60_000
    return Candle(
        open_time=open_time,
        close_time=open_time + 59_999,
        open=open_,
        high=max(open_, close) + 1.0,
        low=min(open_, close) - 1.0,
        close=close,
        volume=1.0,
    )


def test_entry_timeframe_maps_to_required_htf() -> None:
    assert resolve_htf_timeframe("1h") == "1d"
    assert resolve_htf_timeframe("15m") == "4h"
    assert resolve_htf_timeframe("15m", configured_htf="1d") == "1d"


def test_candle_pattern_levels_use_open_close_only() -> None:
    candles = [
        _candle(0, 100, 104),  # bullish
        _candle(1, 105, 101),  # bearish, resistance candidate = 105
        _candle(2, 103, 99),   # bearish
        _candle(3, 98, 102),   # bullish, support candidate = 98
        _candle(4, 101, 108),  # bullish, higher close
        _candle(5, 109, 107),  # bearish, selected resistance = 109
    ]
    levels, selected, _clusters, meta = compute_levels(
        {"4h": candles},
        entry_tf="15m",
        lookback=14,
    )
    assert levels == [98, 109]
    assert meta["htf_timeframe"] == "4h"
    assert meta["support"]["center"] == 98
    assert meta["resistance"]["center"] == 109
    assert {item["role"] for item in selected} == {"support", "resistance"}


def test_daily_levels_are_used_for_1h_entries() -> None:
    daily = [_candle(0, 100, 110), _candle(1, 111, 107)]
    four_hour = [_candle(0, 200, 210), _candle(1, 211, 205)]
    levels, _selected, _clusters, meta = compute_levels(
        {"1d": daily, "4h": four_hour},
        entry_tf="1h",
    )
    assert levels == [111]
    assert meta["htf_timeframe"] == "1d"


def test_role_aware_breakouts_only_long_above_resistance_and_short_below_support() -> None:
    details = build_levels_detailed(
        [98.0, 109.0],
        [
            {"center": 98.0, "role": "support", "htf": "4h"},
            {"center": 109.0, "role": "resistance", "htf": "4h"},
        ],
        last_close=100.0,
        tol_pct_used=0.003,
    )
    roles = level_roles_from_details(details)
    candles = [
        _candle(0, 100, 100),
        _candle(1, 100, 110),  # close above resistance
        _candle(2, 110, 97),   # close below support
    ]
    events = detect_level_events(candles, [98.0, 109.0], level_roles=roles)
    support_event = next(item for item in events if item["level"] == 98.0)
    resistance_event = next(item for item in events if item["level"] == 109.0)
    assert support_event["direction"] == "down"
    assert resistance_event["direction"] == "up"


def test_overrides_still_apply_to_active_levels() -> None:
    merged = apply_overrides([98.0, 109.0], pinned_levels=[120.0], disabled_levels=[98.001], tol_pct=0.003)
    assert merged["final_levels"] == [109.0, 120.0]
