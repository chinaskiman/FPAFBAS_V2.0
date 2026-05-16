import json

import sqlite3

from fastapi.testclient import TestClient

from app.candle_cache import Candle, CandleCache
from app.main import app


class FakeIngest:
    def __init__(self, cache: CandleCache):
        self._cache = cache

    def get_cache(self, symbol: str, tf: str):
        if symbol.upper() == "BTCUSDT" and tf == "1h":
            return self._cache
        return None


def _make_watchlist(path) -> None:
    payload = {
        "symbols": [
            {
                "symbol": "BTCUSDT",
                "enabled": True,
                "entry_tfs": ["1h"],
                "setups": {
                    "continuation": True,
                    "retest": True,
                    "fakeout": True,
                    "setup_candle": True,
                },
                "levels": {
                    "htf_timeframe": "auto",
                    "lookback_window": 14,
                    "overrides": {"add": [], "disable": []},
                },
            }
        ],
        "global": {"max_alerts_per_symbol_per_day": 6, "cooldown_minutes": 60},
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_forward_test_status_summary_and_mode(tmp_path, monkeypatch) -> None:
    watchlist_path = tmp_path / "watchlist.json"
    db_path = tmp_path / "app.db"
    _make_watchlist(watchlist_path)
    monkeypatch.setenv("WATCHLIST_PATH", str(watchlist_path))
    monkeypatch.setenv("SQLITE_PATH", str(db_path))
    monkeypatch.setenv("ADMIN_TOKEN", "dev-token")

    with TestClient(app) as client:
        status = client.get("/api/forward_test/status")
        assert status.status_code == 200
        assert status.json()["enabled"] is True

        summary = client.get("/api/forward_test/summary")
        assert summary.status_code == 200
        assert "metrics" in summary.json()

        pause = client.post(
            "/api/forward_test/mode",
            json={"enabled": False},
            headers={"Authorization": "Bearer dev-token"},
        )
        assert pause.status_code == 200
        assert pause.json()["enabled"] is False

        run = client.post(
            "/api/forward_test/mode",
            json={"enabled": True},
            headers={"Authorization": "Bearer dev-token"},
        )
        assert run.status_code == 200
        assert run.json()["enabled"] is True


def test_forward_test_registers_and_closes_trade(tmp_path, monkeypatch) -> None:
    watchlist_path = tmp_path / "watchlist.json"
    db_path = tmp_path / "app.db"
    _make_watchlist(watchlist_path)
    monkeypatch.setenv("WATCHLIST_PATH", str(watchlist_path))
    monkeypatch.setenv("SQLITE_PATH", str(db_path))

    cache = CandleCache(maxlen=20)
    candles = [
        Candle(0, 59_999, 100.0, 101.0, 99.0, 100.0, 1.0),
        Candle(60_000, 119_999, 100.0, 104.5, 99.8, 103.0, 1.0),
        Candle(120_000, 179_999, 103.0, 104.0, 102.0, 103.5, 1.0),
    ]
    cache.extend(candles)
    ingest = FakeIngest(cache)

    with TestClient(app):
        service = app.state.forward_test
        signal = {
            "id": 1,
            "symbol": "BTCUSDT",
            "tf": "1h",
            "type": "break",
            "direction": "long",
            "time": 59_999,
            "entry": 100.0,
            "sl": 99.0,
            "signal_tf_bias": "bullish",
        }
        created = service.register_signal(signal)
        assert created is not None

        service.process_symbol_tf(ingest, "BTCUSDT", "1h")
        summary = service.get_summary()
        assert summary["metrics"]["total_trades"] >= 1


def test_forward_test_fills_signal_at_next_candle_open(tmp_path, monkeypatch) -> None:
    watchlist_path = tmp_path / "watchlist.json"
    db_path = tmp_path / "app.db"
    _make_watchlist(watchlist_path)
    monkeypatch.setenv("WATCHLIST_PATH", str(watchlist_path))
    monkeypatch.setenv("SQLITE_PATH", str(db_path))

    cache = CandleCache(maxlen=20)
    candles = [
        Candle(0, 59_999, 100.0, 100.8, 99.5, 100.0, 1.0),
        Candle(60_000, 119_999, 101.0, 104.0, 100.5, 103.0, 1.0),
    ]
    cache.extend(candles)
    ingest = FakeIngest(cache)

    with TestClient(app):
        service = app.state.forward_test
        created = service.register_signal(
            {
                "id": 2,
                "symbol": "BTCUSDT",
                "tf": "1h",
                "type": "break",
                "direction": "long",
                "time": 59_999,
                "entry": 100.0,
                "sl": 99.0,
                "signal_tf_bias": "bullish",
            }
        )
        assert created is not None

        service.process_symbol_tf(ingest, "BTCUSDT", "1h")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        position = conn.execute("SELECT * FROM forward_test_positions").fetchone()
        order = conn.execute("SELECT * FROM forward_test_orders").fetchone()
    finally:
        conn.close()

    assert position is not None
    assert position["status"] == "open"
    assert position["entry_time"] == 60_000
    assert position["entry_price"] == 101.0
    assert position["tp_price"] == 105.0
    assert order["status"] == "filled"
    assert order["filled_at"] == 60_000
    assert order["filled_price"] == 101.0


def test_forward_test_cancels_next_open_gap_through_stop(tmp_path, monkeypatch) -> None:
    watchlist_path = tmp_path / "watchlist.json"
    db_path = tmp_path / "app.db"
    _make_watchlist(watchlist_path)
    monkeypatch.setenv("WATCHLIST_PATH", str(watchlist_path))
    monkeypatch.setenv("SQLITE_PATH", str(db_path))

    cache = CandleCache(maxlen=20)
    candles = [
        Candle(0, 59_999, 100.0, 101.0, 99.0, 100.0, 1.0),
        Candle(60_000, 119_999, 98.5, 100.0, 98.0, 99.0, 1.0),
    ]
    cache.extend(candles)
    ingest = FakeIngest(cache)

    with TestClient(app):
        service = app.state.forward_test
        created = service.register_signal(
            {
                "id": 3,
                "symbol": "BTCUSDT",
                "tf": "1h",
                "type": "break",
                "direction": "long",
                "time": 59_999,
                "entry": 100.0,
                "sl": 99.0,
                "signal_tf_bias": "bullish",
            }
        )
        assert created is not None

        service.process_symbol_tf(ingest, "BTCUSDT", "1h")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        position_count = conn.execute("SELECT COUNT(1) AS count FROM forward_test_positions").fetchone()["count"]
        order = conn.execute("SELECT * FROM forward_test_orders").fetchone()
    finally:
        conn.close()

    assert position_count == 0
    assert order["status"] == "cancelled"
    assert order["status_reason"] == "invalid_stop_after_gap"


def test_forward_test_cancels_stale_pending_order_after_next_open_was_missed(tmp_path, monkeypatch) -> None:
    watchlist_path = tmp_path / "watchlist.json"
    db_path = tmp_path / "app.db"
    _make_watchlist(watchlist_path)
    monkeypatch.setenv("WATCHLIST_PATH", str(watchlist_path))
    monkeypatch.setenv("SQLITE_PATH", str(db_path))

    cache = CandleCache(maxlen=20)
    candles = [
        Candle(0, 59_999, 100.0, 100.8, 99.5, 100.0, 1.0),
        Candle(60_000, 119_999, 101.0, 104.0, 100.5, 103.0, 1.0),
    ]
    cache.extend(candles)
    ingest = FakeIngest(cache)

    with TestClient(app):
        service = app.state.forward_test
        created = service.register_signal(
            {
                "id": 4,
                "symbol": "BTCUSDT",
                "tf": "1h",
                "type": "break",
                "direction": "long",
                "time": 59_999,
                "entry": 100.0,
                "sl": 99.0,
                "signal_tf_bias": "bullish",
            }
        )
        assert created is not None
        conn = sqlite3.connect(db_path)
        try:
            conn.execute("UPDATE forward_test_orders SET candles_waited = 1")
            conn.commit()
        finally:
            conn.close()

        service.process_symbol_tf(ingest, "BTCUSDT", "1h")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        position_count = conn.execute("SELECT COUNT(1) AS count FROM forward_test_positions").fetchone()["count"]
        order = conn.execute("SELECT * FROM forward_test_orders").fetchone()
    finally:
        conn.close()

    assert position_count == 0
    assert order["status"] == "cancelled"
    assert order["status_reason"] == "missed_next_open"
