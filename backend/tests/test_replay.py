from fastapi.testclient import TestClient

from app import main as main_module
from app.candle_cache import Candle, CandleCache
from app.config import WatchlistConfig
from app.main import app
from app.replay import replay_performance_report, replay_run, replay_summary


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
                        "overrides": {"add": pinned or [], "disable": []},
                    },
                    "rules": rules or {
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


def test_replay_uses_only_closed_htf_candles_for_pattern_levels() -> None:
    candles = [
        _make_candle(0, close=99.0, high=101.0, low=98.0, open_=100.0),
        _make_candle(1, close=103.0, high=104.0, low=98.0, open_=99.0),
        _make_candle(2, close=101.0, high=104.0, low=100.0, open_=104.0),
    ]
    ingest = FakeIngest({"4h": candles, "15m": candles})
    config = _make_watchlist()
    result = replay_run(
        ingest,
        config,
        "BTCUSDT",
        "15m",
        from_ms=candles[0].close_time,
        to_ms=candles[-1].close_time,
        warmup=0,
    )
    items = result["items"]
    assert len(items) == len(candles)
    assert items[0]["levels"] == []
    assert items[1]["levels"] == [99.0]
    assert items[2]["levels"] == [99.0, 104.0]


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


def test_replay_performance_report_groups_outcomes_and_quality() -> None:
    result = {
        "symbol": "BTCUSDT",
        "tf": "1h",
        "step": 1,
        "items": [
            {
                "time": 1000,
                "candle": {"high": 101.0, "low": 99.0},
                "signals": [
                    {
                        "type": "retest",
                        "direction": "long",
                        "time": 1000,
                        "entry": 100.0,
                        "sl": 95.0,
                        "context": {
                            "weekly_bias": "bullish",
                            "daily_bias": "bullish",
                            "four_hour_bias": "bullish",
                            "hwc_bias": "bullish",
                            "mwc_bias": "bullish",
                            "volume_spike_ok": True,
                            "pullback_vol_decline": True,
                            "not_at_peak_long": True,
                            "rsi_distance": 20.0,
                        },
                    }
                ],
            },
            {"time": 2000, "candle": {"high": 111.0, "low": 99.0}, "signals": []},
            {"time": 3000, "candle": {"high": 113.0, "low": 100.0}, "signals": []},
        ],
    }

    report = replay_performance_report(result)

    assert report["trades"] == 1
    assert report["wins"] == 1
    assert report["losses"] == 0
    assert report["win_rate"] == 1.0
    assert report["realized_r_total"] == 2.0
    assert report["trade_rows"][0]["quality_grade"] == "A"
    assert report["trade_rows"][0]["bias_alignment_count"] == 5
    by_type = {item["key"]: item for item in report["groups"]["by_type"]}
    assert by_type["retest"]["wins"] == 1
    by_quality = {item["key"]: item for item in report["groups"]["by_quality"]}
    assert by_quality["A"]["trades"] == 1


def test_replay_summary_api_uses_full_timeline_for_performance(monkeypatch) -> None:
    sampled_result = {
        "symbol": "BTCUSDT",
        "tf": "1h",
        "step": 2,
        "items": [
            {
                "time": 1000,
                "candle": {"high": 101.0, "low": 99.0},
                "signals": [
                    {
                        "type": "retest",
                        "direction": "long",
                        "time": 1000,
                        "entry": 100.0,
                        "sl": 95.0,
                        "context": {
                            "weekly_bias": "bullish",
                            "daily_bias": "bullish",
                            "four_hour_bias": "bullish",
                            "hwc_bias": "bullish",
                            "mwc_bias": "bullish",
                            "volume_spike_ok": True,
                            "pullback_vol_decline": True,
                            "not_at_peak_long": True,
                            "rsi_distance": 20.0,
                        },
                    }
                ],
            }
        ],
    }
    full_result = {
        **sampled_result,
        "step": 1,
        "items": [
            *sampled_result["items"],
            {"time": 2000, "candle": {"high": 111.0, "low": 99.0}, "signals": []},
        ],
    }
    calls = []

    def fake_replay_run(*_args, step=1, **_kwargs):
        calls.append(step)
        return full_result if step == 1 else sampled_result

    monkeypatch.setattr(main_module, "load_watchlist", lambda: object())
    monkeypatch.setattr(main_module, "replay_run", fake_replay_run)

    with TestClient(app) as client:
        app.state.ingest = FakeIngest({})
        response = client.get("/api/replay_summary/BTCUSDT/1h?from_ms=1&to_ms=3000&step=2&warmup=0")

    assert response.status_code == 200
    payload = response.json()
    assert calls == [2, 1]
    assert payload["step"] == 2
    assert payload["performance"]["trades"] == 1
    assert payload["performance"]["wins"] == 1
    assert payload["performance"]["sample_warning"] is False
