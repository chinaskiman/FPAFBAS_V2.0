from fastapi.testclient import TestClient

from app.candle_cache import Candle, CandleCache
from app.config import WatchlistConfig
from app.main import app
from app.replay import replay_run, replay_summary


class FakeIngest:
    def __init__(self, candles_by_tf):
        self._caches = {}
        for tf, candles in candles_by_tf.items():
            cache = CandleCache(maxlen=2000)
            cache.extend(candles)
            self._caches[("BTCUSDT", tf)] = cache

    def get_cache(self, symbol, tf):
        return self._caches.get((symbol.upper(), tf))

    def get_cached_range(self, symbol, tf, from_ms, to_ms, limit=None):
        cache = self.get_cache(symbol, tf)
        if cache is None:
            return []
        candles = [c for c in cache.list_all() if from_ms <= c.close_time <= to_ms]
        if limit is not None and limit > 0:
            candles = candles[-limit:]
        return candles

    def stop(self):
        return None


def _make_candle(idx: int, close: float, high: float, low: float, open_: float | None = None) -> Candle:
    open_time = idx * 60_000
    close_time = open_time + 59_999
    return Candle(
        open_time=open_time,
        close_time=close_time,
        open=close if open_ is None else open_,
        high=high,
        low=low,
        close=close,
        volume=1.0,
    )


def _make_candle_with_volume(idx: int, close: float, high: float, low: float, volume: float) -> Candle:
    open_time = idx * 60_000
    close_time = open_time + 59_999
    return Candle(
        open_time=open_time,
        close_time=close_time,
        open=close,
        high=high,
        low=low,
        close=close,
        volume=volume,
    )


def _cache_candles_from_series(highs, lows):
    return [_make_candle(idx, close=(high + low) / 2, high=high, low=low) for idx, (high, low) in enumerate(zip(highs, lows))]


def _bullish_htf_candles():
    highs = [1, 2, 3, 6, 4, 3, 2, 7, 4, 3, 2]
    lows = [6, 5, 4, 2, 3, 4, 5, 3, 4, 5, 6]
    return _cache_candles_from_series(highs, lows)


def _make_watchlist(pinned=None, rules=None) -> WatchlistConfig:
    return WatchlistConfig.model_validate(
        {
            "symbols": [
                {
                    "symbol": "BTCUSDT",
                    "enabled": True,
                    "entry_tfs": ["15m", "1h"],
                    "setups": {
                        "continuation": True,
                        "retest": True,
                        "fakeout": True,
                        "setup_candle": True,
                    },
                    "levels": {
                        "auto": True,
                        "max_levels": 6,
                        "cluster_tol_pct": 0.05,
                        "overrides": {"add": pinned or [], "disable": []},
                    },
                    "rules": rules or {
                        "hwc_filter": True,
                        "di_peak_filter": True,
                        "volume_spike_filter": True,
                        "fakeout_volume_filter": True,
                        "pullback_volume_filter": True,
                    },
                }
            ],
            "global": {"max_alerts_per_symbol_per_day": 6, "cooldown_minutes": 60},
        }
    )


def test_replay_no_lookahead_pivot() -> None:
    highs = [1.0, 2.0, 5.0, 2.0, 1.0]
    lows = [0.5] * len(highs)
    candles = [_make_candle(i, close=highs[i], high=highs[i], low=lows[i]) for i in range(len(highs))]
    ingest = FakeIngest({"4h": candles})
    config = _make_watchlist()
    result = replay_run(
        ingest,
        config,
        "BTCUSDT",
        "4h",
        from_ms=candles[0].close_time,
        to_ms=candles[-1].close_time,
        warmup=0,
    )
    items = result["items"]
    assert len(items) == len(candles)
    levels_before = items[2]["levels"]
    levels_after = items[4]["levels"]
    assert not any(abs(level - 5.0) < 1e-6 for level in levels_before)
    assert any(abs(level - 5.0) < 1e-6 for level in levels_after)


def test_replay_setup_sequence_triggers() -> None:
    level = 100.0
    candles = [_make_candle(idx, 99, 100, 98) for idx in range(98)]
    candles.append(_make_candle(98, 101, 102, 100.5, open_=100))  # break
    candles.append(_make_candle(99, 102, 103, 99.5, open_=101))   # retest wick
    candles.extend(_make_candle(idx, 102, 103, 101) for idx in range(100, 103))
    candles.append(_make_candle(103, 104, 104.2, 101.4, open_=103))  # setup candle
    ingest = FakeIngest({"1h": candles, "4h": candles, "1d": candles, "1w": candles})
    config = _make_watchlist(pinned=[level])
    result = replay_run(
        ingest,
        config,
        "BTCUSDT",
        "1h",
        from_ms=candles[0].close_time,
        to_ms=candles[-1].close_time,
        warmup=0,
        include_debug=True,
    )
    last_item = result["items"][-1]
    setups = last_item.get("setup_candles") or []
    assert any(item.get("setup_index") == 103 for item in setups)


def test_replay_output_stable() -> None:
    candles = [_make_candle(i, 100 + i, 101 + i, 99 + i) for i in range(5)]
    ingest = FakeIngest({"1h": candles, "4h": candles, "1d": candles, "1w": candles})
    config = _make_watchlist()
    result1 = replay_run(
        ingest,
        config,
        "BTCUSDT",
        "1h",
        from_ms=candles[0].close_time,
        to_ms=candles[-1].close_time,
        warmup=0,
    )
    result2 = replay_run(
        ingest,
        config,
        "BTCUSDT",
        "1h",
        from_ms=candles[0].close_time,
        to_ms=candles[-1].close_time,
        warmup=0,
    )
    assert result1["items"] == result2["items"]


def test_replay_step_keeps_skipped_signal_candles() -> None:
    level = 100.0
    closes = [95, 96, 97, 98, 99, 99, 99, 99, 99, 101, 102, 103]
    candles = [
        _make_candle_with_volume(
            idx,
            close,
            high=close + 1,
            low=close - 1,
            volume=3 if idx == 9 else 1,
        )
        for idx, close in enumerate(closes)
    ]
    htf = _bullish_htf_candles()
    ingest = FakeIngest({"1h": candles, "4h": htf, "1d": htf, "1w": htf})
    config = _make_watchlist(pinned=[level])
    result = replay_run(
        ingest,
        config,
        "BTCUSDT",
        "1h",
        from_ms=candles[0].close_time,
        to_ms=candles[-1].close_time,
        step=2,
        warmup=0,
    )

    signal_items = [item for item in result["items"] if item.get("signals")]
    assert any(item["index"] == 9 for item in signal_items)
    assert any(signal["type"] == "break" for item in signal_items for signal in item["signals"])


def test_replay_summary_counts_retest_signals() -> None:
    level = 100.0
    closes = [95, 96, 97, 98, 99, 101, 102, 101.5, 101]
    lows = [close - 1 for close in closes]
    lows[7] = 100.5
    lows[8] = 99.5
    volumes = [1, 1, 1, 1, 1, 1, 5, 4, 3]
    candles = [
        _make_candle_with_volume(
            idx,
            close,
            high=close + 1,
            low=lows[idx],
            volume=volumes[idx],
        )
        for idx, close in enumerate(closes)
    ]
    htf = _bullish_htf_candles()
    ingest = FakeIngest({"1h": candles, "4h": htf, "1d": htf, "1w": htf})
    config = _make_watchlist(
        pinned=[level],
        rules={
            "hwc_filter": False,
            "di_peak_filter": True,
            "volume_spike_filter": True,
            "fakeout_volume_filter": True,
            "pullback_volume_filter": True,
        },
    )
    result = replay_run(
        ingest,
        config,
        "BTCUSDT",
        "1h",
        from_ms=candles[0].close_time,
        to_ms=candles[-1].close_time,
        warmup=0,
    )
    summary = replay_summary(result)

    assert summary["by_type"]["retest"] == 1
    assert any(
        signal["type"] == "retest"
        for item in result["items"]
        for signal in item.get("signals", [])
    )
