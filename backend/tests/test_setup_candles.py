import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.candle_cache import Candle, CandleCache
from app.indicators import sma
from app.main import app
from app.setup_candles import detect_setup_candles


def _make_candle(
    idx: int,
    close: float,
    high: float | None = None,
    low: float | None = None,
    open_: float | None = None,
) -> Candle:
    open_time = idx * 60_000
    close_time = open_time + 59_999
    high = high if high is not None else close + 1
    low = low if low is not None else close - 1
    open_ = open_ if open_ is not None else close
    return Candle(
        open_time=open_time,
        close_time=close_time,
        open=open_,
        high=high,
        low=low,
        close=close,
        volume=1.0,
    )


def _flat_candles(count: int, close: float) -> list[Candle]:
    return [_make_candle(idx, close, high=close + 1, low=close - 1, open_=close) for idx in range(count)]


def _smas(candles: list[Candle]) -> tuple[list[float | None], list[float | None], list[float | None]]:
    closes = [candle.close for candle in candles]
    return sma(closes, 7), sma(closes, 25), sma(closes, 99)


def test_setup_candle_long_requires_lower_wick_and_sma_stack_ready() -> None:
    candles = _flat_candles(103, 102.0)
    candles.append(_make_candle(103, 104.0, high=104.2, low=101.4, open_=103.0))
    sma7, sma25, sma99 = _smas(candles)
    events = [
        {
            "level": 100.0,
            "direction": "up",
            "last_break": {"index": 90},
            "retest_index": 102,
            "last_fakeout": None,
        }
    ]

    items = detect_setup_candles(candles, sma7, sma25, sma99, events, sl_buffer_pct=0.0015)

    assert len(items) == 1
    item = items[0]
    assert item["direction"] == "long"
    assert item["setup_index"] == 103
    assert item["entry"] == candles[103].close
    assert item["sl"] == candles[103].low * (1 - 0.0015)
    assert item["directional_wick"] == pytest.approx(1.6)
    assert item["wick_body_ratio"] == pytest.approx(1.6)
    assert item["sma7"] is not None
    assert item["sma25"] is not None
    assert item["sma99"] is not None


def test_setup_candle_short_requires_upper_wick_and_sma_stack_ready() -> None:
    candles = _flat_candles(103, 98.0)
    candles.append(_make_candle(103, 96.0, high=98.6, low=95.8, open_=97.0))
    sma7, sma25, sma99 = _smas(candles)
    events = [
        {
            "level": 100.0,
            "direction": "down",
            "last_break": {"index": 90},
            "retest_index": 102,
            "last_fakeout": None,
        }
    ]

    items = detect_setup_candles(candles, sma7, sma25, sma99, events, sl_buffer_pct=0.0015)

    assert len(items) == 1
    item = items[0]
    assert item["direction"] == "short"
    assert item["setup_index"] == 103
    assert item["entry"] == candles[103].close
    assert item["sl"] == candles[103].high * (1 + 0.0015)
    assert item["directional_wick"] == pytest.approx(1.6)
    assert item["wick_body_ratio"] == pytest.approx(1.6)


def test_setup_candle_rejects_sma7_inside_or_ahead_of_body() -> None:
    candles = _flat_candles(103, 106.0)
    candles.append(_make_candle(103, 104.0, high=104.2, low=101.4, open_=103.0))
    sma7, sma25, sma99 = _smas(candles)
    events = [
        {
            "level": 100.0,
            "direction": "up",
            "last_break": {"index": 90},
            "retest_index": 102,
            "last_fakeout": None,
        }
    ]

    items = detect_setup_candles(candles, sma7, sma25, sma99, events, sl_buffer_pct=0.0015)

    assert items == []


def test_setup_candle_rejects_small_directional_wick() -> None:
    candles = _flat_candles(103, 102.0)
    candles.append(_make_candle(103, 104.0, high=104.2, low=102.0, open_=103.0))
    sma7, sma25, sma99 = _smas(candles)
    events = [
        {
            "level": 100.0,
            "direction": "up",
            "last_break": {"index": 90},
            "retest_index": 102,
            "last_fakeout": None,
        }
    ]

    items = detect_setup_candles(candles, sma7, sma25, sma99, events, sl_buffer_pct=0.0015)

    assert items == []


def test_setup_candle_rejects_until_sma99_ready() -> None:
    candles = _flat_candles(30, 102.0)
    candles.append(_make_candle(30, 104.0, high=104.2, low=101.4, open_=103.0))
    sma7, sma25, sma99 = _smas(candles)
    events = [
        {
            "level": 100.0,
            "direction": "up",
            "last_break": {"index": 20},
            "retest_index": 29,
            "last_fakeout": None,
        }
    ]

    items = detect_setup_candles(candles, sma7, sma25, sma99, events, sl_buffer_pct=0.0015)

    assert items == []


def test_setup_candle_blocked_by_fakeout() -> None:
    candles = _flat_candles(103, 102.0)
    candles.append(_make_candle(103, 104.0, high=104.2, low=101.4, open_=103.0))
    sma7, sma25, sma99 = _smas(candles)
    events = [
        {
            "level": 100.0,
            "direction": "up",
            "last_break": {"index": 90},
            "retest_index": 102,
            "last_fakeout": {"index": 103},
        }
    ]
    items = detect_setup_candles(candles, sma7, sma25, sma99, events, sl_buffer_pct=0.0015)
    assert items == []


class FakeIngest:
    def __init__(self, tf_cache: CandleCache, htf_cache: CandleCache):
        self._caches = {
            ("BTCUSDT", "1h"): tf_cache,
            ("BTCUSDT", "1w"): htf_cache,
            ("BTCUSDT", "1d"): htf_cache,
            ("BTCUSDT", "4h"): htf_cache,
        }

    def get_cache(self, symbol, tf):
        return self._caches.get((symbol.upper(), tf))

    def stop(self):
        return None


def test_setup_candles_endpoint(tmp_path, monkeypatch) -> None:
    watchlist_path = tmp_path / "watchlist.json"
    watchlist = {
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
                    "overrides": {"add": [100.0], "disable": []},
                },
            }
        ],
        "global": {"max_alerts_per_symbol_per_day": 6, "cooldown_minutes": 60},
    }
    watchlist_path.write_text(json.dumps(watchlist), encoding="utf-8")
    monkeypatch.setenv("WATCHLIST_PATH", str(watchlist_path))

    candles = [_make_candle(idx, 99.0, high=100.0, low=98.0, open_=99.0) for idx in range(98)]
    candles.append(_make_candle(98, 101.0, high=102.0, low=100.5, open_=100.0))
    candles.append(_make_candle(99, 102.0, high=103.0, low=99.5, open_=101.0))
    candles.extend(_make_candle(idx, 102.0, high=103.0, low=101.0, open_=102.0) for idx in range(100, 103))
    candles.append(_make_candle(103, 104.0, high=104.2, low=101.4, open_=103.0))
    tf_cache = CandleCache(maxlen=2000)
    tf_cache.extend(candles)

    htf_cache = CandleCache(maxlen=2000)
    htf_cache.extend(
        [_make_candle(idx, 300.0, high=302.0, low=298.0, open_=300.0) for idx in range(len(candles))]
    )
    with TestClient(app) as client:
        app.state.ingest = FakeIngest(tf_cache, htf_cache)
        resp = client.get("/api/setup_candles/BTCUSDT/1h?limit=150")
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["symbol"] == "BTCUSDT"
        assert payload["tf"] == "1h"
        assert any(item["setup_index"] == 103 for item in payload["items"])
