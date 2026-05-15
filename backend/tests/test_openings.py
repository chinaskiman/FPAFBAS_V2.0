import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.candle_cache import Candle, CandleCache
from app.main import app
from app.openings import build_openings
from app.config import WatchlistConfig


def _make_candle(idx: int, close: float, high: float | None = None, low: float | None = None, volume: float = 1.0) -> Candle:
    open_time = idx * 60_000
    close_time = open_time + 59_999
    high = high if high is not None else close + 1
    low = low if low is not None else close - 1
    return Candle(
        open_time=open_time,
        close_time=close_time,
        open=close,
        high=high,
        low=low,
        close=close,
        volume=volume,
    )


def _cache_from_series(highs, lows) -> CandleCache:
    cache = CandleCache(maxlen=2000)
    for idx, (high, low) in enumerate(zip(highs, lows)):
        close = (high + low) / 2
        cache.append(_make_candle(idx, close, high=high, low=low))
    return cache


def _bullish_htf() -> CandleCache:
    highs = [1, 2, 3, 6, 4, 3, 2, 7, 4, 3, 2]
    lows = [6, 5, 4, 2, 3, 4, 5, 3, 4, 5, 6]
    return _cache_from_series(highs, lows)


def _bearish_htf() -> CandleCache:
    highs = [8, 7, 6, 9, 6, 5, 7, 4, 3, 5, 2]
    lows = [5, 4, 3, 4, 2, 1, 3, 2, 0.5, 2, 3]
    return _cache_from_series(highs, lows)


class FakeIngest:
    def __init__(self, tf_cache: CandleCache, weekly: CandleCache, daily: CandleCache):
        self._caches = {
            ("BTCUSDT", "15m"): tf_cache,
            ("BTCUSDT", "1w"): weekly,
            ("BTCUSDT", "1d"): daily,
            ("BTCUSDT", "4h"): daily,
        }
        self._indicator_data = {}

    def set_indicators(self, data: dict):
        self._indicator_data = data

    def get_cache(self, symbol, tf):
        return self._caches.get((symbol.upper(), tf))

    def list_indicators(self, symbol: str, tf: str, limit: int = 10):
        return self._indicator_data

    def stop(self):
        return None


def _watchlist(tmp_path: Path, level: float, rules: dict | None = None, setups: dict | None = None) -> dict:
    watchlist = {
        "symbols": [
            {
                "symbol": "BTCUSDT",
                "enabled": True,
                "entry_tfs": ["15m", "1h"],
                "setups": setups or {
                    "continuation": True,
                    "retest": True,
                    "fakeout": True,
                    "setup_candle": True,
                },
                "rules": rules or {
                    "di_peak_filter": True,
                    "volume_spike_filter": True,
                    "fakeout_volume_filter": True,
                    "pullback_volume_filter": True,
                },
                "levels": {
                    "auto": True,
                    "max_levels": 5,
                    "cluster_tol_pct": 0.01,
                    "overrides": {"add": [level], "disable": []},
                },
            }
        ],
        "global": {"max_alerts_per_symbol_per_day": 6, "cooldown_minutes": 60},
    }
    path = tmp_path / "watchlist.json"
    path.write_text(json.dumps(watchlist), encoding="utf-8")
    return watchlist


def test_hwc_neutral_does_not_suppress_signals(monkeypatch, tmp_path) -> None:
    level = 100.0
    watchlist = _watchlist(tmp_path, level)
    monkeypatch.setenv("WATCHLIST_PATH", str(tmp_path / "watchlist.json"))

    tf_cache = CandleCache(maxlen=2000)
    volumes = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2]
    closes = [95, 96, 97, 98, 99, 99, 99, 99, 99, 101]
    for idx, close in enumerate(closes):
        tf_cache.append(_make_candle(idx, close, high=close + 1, low=close - 1, volume=volumes[idx]))
    neutral_cache = CandleCache(maxlen=2000)
    ingest = FakeIngest(tf_cache, neutral_cache, neutral_cache)
    ingest.set_indicators(
        {
            "candles": [],
            "rsi14": [60.0] * len(closes),
            "atr5": [2.0] * len(closes),
            "di_plus": list(range(30, 30 - len(closes), -1)),
            "di_minus": [10.0] * len(closes),
            "sma7": [None] * len(closes),
        }
    )
    config = WatchlistConfig.model_validate(watchlist)
    result = build_openings(ingest, config, "BTCUSDT", "15m", limit=10)
    assert result["hwc_bias"] == "neutral"
    assert result["mwc_bias"] == "neutral"
    assert result["weekly_bias"] == "neutral"
    assert result["daily_bias"] == "neutral"
    assert result["four_hour_bias"] == "neutral"
    assert any(signal["type"] == "break" for signal in result["signals"])


def test_symbol_rule_can_disable_di_peak_filter(monkeypatch, tmp_path) -> None:
    level = 100.0
    rules = {
        "di_peak_filter": False,
        "volume_spike_filter": True,
        "fakeout_volume_filter": True,
        "pullback_volume_filter": True,
    }
    watchlist = _watchlist(tmp_path, level, rules=rules)
    monkeypatch.setenv("WATCHLIST_PATH", str(tmp_path / "watchlist.json"))

    tf_cache = CandleCache(maxlen=2000)
    volumes = [1, 1, 1, 1, 1, 1, 1, 1, 1, 3]
    closes = [95, 96, 97, 98, 99, 99, 99, 99, 99, 101]
    for idx, close in enumerate(closes):
        tf_cache.append(_make_candle(idx, close, high=close + 1, low=close - 1, volume=volumes[idx]))

    ingest = FakeIngest(tf_cache, _bullish_htf(), _bullish_htf())
    ingest.set_indicators(
        {
            "candles": [],
            "rsi14": [60.0] * len(closes),
            "atr5": [2.0] * len(closes),
            "di_plus": [30.0] * len(closes),
            "di_minus": [10.0] * len(closes),
            "sma7": [None] * len(closes),
        }
    )
    config = WatchlistConfig.model_validate(watchlist)
    result = build_openings(ingest, config, "BTCUSDT", "15m", limit=10)
    assert any(signal["type"] == "break" for signal in result["signals"])


def test_break_signal_strong_momentum(monkeypatch, tmp_path) -> None:
    level = 100.0
    watchlist = _watchlist(tmp_path, level)
    monkeypatch.setenv("WATCHLIST_PATH", str(tmp_path / "watchlist.json"))

    tf_cache = CandleCache(maxlen=2000)
    volumes = [1, 1, 1, 1, 1, 1, 1, 1, 1, 3]
    closes = [95, 96, 97, 98, 99, 99, 99, 99, 99, 101]
    for idx, close in enumerate(closes):
        tf_cache.append(_make_candle(idx, close, high=close + 1, low=close - 1, volume=volumes[idx]))

    ingest = FakeIngest(tf_cache, _bullish_htf(), _bullish_htf())
    ingest.set_indicators(
        {
            "candles": [],
            "rsi14": [60.0] * len(closes),
            "atr5": [2.0] * len(closes),
            "di_plus": list(range(30, 30 - len(closes), -1)),
            "di_minus": [10.0] * len(closes),
            "sma7": [None] * len(closes),
        }
    )
    config = WatchlistConfig.model_validate(watchlist)
    result = build_openings(ingest, config, "BTCUSDT", "15m", limit=10)
    assert result["signals"]
    signal = result["signals"][0]
    assert signal["type"] == "break"
    assert signal["direction"] == "long"
    assert signal["sl_reason"] == "atr_stop"
    assert signal["candle"]["close"] == signal["entry"]
    assert signal["level_event"]["break_index"] is not None
    assert signal["context"]["hwc_bias"] == "bullish"
    assert signal["context"]["mwc_bias"] == "bullish"
    assert signal["context"]["weekly_bias"] == "bullish"
    assert signal["context"]["daily_bias"] == "bullish"
    assert signal["context"]["four_hour_bias"] == "bullish"


def test_break_suppressed_when_no_momentum(monkeypatch, tmp_path) -> None:
    level = 100.0
    watchlist = _watchlist(tmp_path, level)
    monkeypatch.setenv("WATCHLIST_PATH", str(tmp_path / "watchlist.json"))

    tf_cache = CandleCache(maxlen=2000)
    closes = [95, 96, 97, 98, 99, 99, 99, 99, 99, 101]
    for idx, close in enumerate(closes):
        volume = 1 if idx == len(closes) - 1 else 2
        tf_cache.append(_make_candle(idx, close, high=close + 1, low=close - 1, volume=volume))

    ingest = FakeIngest(tf_cache, _bullish_htf(), _bullish_htf())
    ingest.set_indicators(
        {
            "candles": [],
            "rsi14": [60.0] * len(closes),
            "atr5": [2.0] * len(closes),
            "di_plus": [30.0] * len(closes),
            "di_minus": [10.0] * len(closes),
            "sma7": [None] * len(closes),
        }
    )
    config = WatchlistConfig.model_validate(watchlist)
    result = build_openings(ingest, config, "BTCUSDT", "15m", limit=10)
    assert all(signal["type"] != "break" for signal in result["signals"])


def test_retest_signal_after_break_and_valid_touch(monkeypatch, tmp_path) -> None:
    level = 100.0
    watchlist = _watchlist(tmp_path, level)
    monkeypatch.setenv("WATCHLIST_PATH", str(tmp_path / "watchlist.json"))

    tf_cache = CandleCache(maxlen=2000)
    closes = [95, 96, 97, 98, 99, 101, 102, 101.5, 101]
    lows = [close - 1 for close in closes]
    lows[7] = 100.5
    lows[8] = 99.5
    volumes = [1, 1, 1, 1, 1, 1, 5, 4, 3]
    for idx, close in enumerate(closes):
        tf_cache.append(_make_candle(idx, close, high=close + 1, low=lows[idx], volume=volumes[idx]))

    ingest = FakeIngest(tf_cache, _bullish_htf(), _bullish_htf())
    ingest.set_indicators(
        {
            "candles": [],
            "rsi14": [60.0] * len(closes),
            "atr5": [2.0] * len(closes),
            "di_plus": list(range(30, 30 - len(closes), -1)),
            "di_minus": [10.0] * len(closes),
            "sma7": [None] * len(closes),
        }
    )
    config = WatchlistConfig.model_validate(watchlist)
    result = build_openings(ingest, config, "BTCUSDT", "15m", limit=10)

    assert any(signal["type"] == "retest" for signal in result["signals"])
    retest = next(signal for signal in result["signals"] if signal["type"] == "retest")
    candle = retest["candle"]
    assert retest["direction"] == "long"
    assert retest["entry"] == candle["close"]
    assert retest["sl"] == candle["low"] * (1 - 0.0015)
    assert retest["sl_reason"] == "retest_extreme"
    assert retest["level_event"]["break_index"] == 5
    assert retest["level_event"]["retest_index"] == 8


def test_symbol_setup_can_disable_retest_signal(monkeypatch, tmp_path) -> None:
    level = 100.0
    setups = {
        "continuation": True,
        "retest": False,
        "fakeout": True,
        "setup_candle": True,
    }
    watchlist = _watchlist(tmp_path, level, setups=setups)
    monkeypatch.setenv("WATCHLIST_PATH", str(tmp_path / "watchlist.json"))

    tf_cache = CandleCache(maxlen=2000)
    closes = [95, 96, 97, 98, 99, 101, 102, 101.5, 101]
    lows = [close - 1 for close in closes]
    lows[7] = 100.5
    lows[8] = 99.5
    volumes = [1, 1, 1, 1, 1, 1, 5, 4, 3]
    for idx, close in enumerate(closes):
        tf_cache.append(_make_candle(idx, close, high=close + 1, low=lows[idx], volume=volumes[idx]))

    ingest = FakeIngest(tf_cache, _bullish_htf(), _bullish_htf())
    ingest.set_indicators(
        {
            "candles": [],
            "rsi14": [60.0] * len(closes),
            "atr5": [2.0] * len(closes),
            "di_plus": list(range(30, 30 - len(closes), -1)),
            "di_minus": [10.0] * len(closes),
            "sma7": [None] * len(closes),
        }
    )
    config = WatchlistConfig.model_validate(watchlist)
    result = build_openings(ingest, config, "BTCUSDT", "15m", limit=10)

    assert all(signal["type"] != "retest" for signal in result["signals"])


def test_fakeout_signal(monkeypatch, tmp_path) -> None:
    level = 100.0
    watchlist = _watchlist(tmp_path, level)
    monkeypatch.setenv("WATCHLIST_PATH", str(tmp_path / "watchlist.json"))

    tf_cache = CandleCache(maxlen=2000)
    volumes = [1, 1, 1, 1, 1, 1, 1, 1, 1, 3]
    closes = [95, 96, 97, 98, 99, 101, 100, 100, 100, 99]
    highs = [c + 1 for c in closes]
    lows = [c - 1 for c in closes]
    for idx, close in enumerate(closes):
        tf_cache.append(_make_candle(idx, close, high=highs[idx], low=lows[idx], volume=volumes[idx]))

    ingest = FakeIngest(tf_cache, _bearish_htf(), _bearish_htf())
    ingest.set_indicators(
        {
            "candles": [],
            "rsi14": [60.0] * len(closes),
            "atr5": [2.0] * len(closes),
            "di_plus": [10.0] * len(closes),
            "di_minus": [20.0] * len(closes),
            "sma7": [None] * len(closes),
        }
    )
    config = WatchlistConfig.model_validate(watchlist)
    result = build_openings(ingest, config, "BTCUSDT", "15m", limit=10)
    assert any(signal["type"] == "fakeout" for signal in result["signals"])
    fakeout = next(signal for signal in result["signals"] if signal["type"] == "fakeout")
    candle = fakeout["candle"]
    assert candle is not None
    assert fakeout["sl"] == candle["high"] * (1 + 0.0015)


def test_openings_endpoint(tmp_path, monkeypatch) -> None:
    watchlist = _watchlist(tmp_path, 100.0)
    monkeypatch.setenv("WATCHLIST_PATH", str(tmp_path / "watchlist.json"))
    tf_cache = CandleCache(maxlen=2000)
    tf_cache.append(_make_candle(0, 100, 101, 99, volume=1))
    ingest = FakeIngest(tf_cache, _bullish_htf(), _bullish_htf())
    ingest.set_indicators(
        {
            "candles": [],
            "rsi14": [60.0],
            "atr5": [2.0],
            "di_plus": [10.0],
            "di_minus": [5.0],
            "sma7": [None],
        }
    )
    with TestClient(app) as client:
        app.state.ingest = ingest
        resp = client.get("/api/openings/BTCUSDT/15m?limit=10")
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["symbol"] == "BTCUSDT"
        assert "signals" in payload
        if payload["signals"]:
            signal = payload["signals"][0]
            assert "candle" in signal
            assert "level_event" in signal
