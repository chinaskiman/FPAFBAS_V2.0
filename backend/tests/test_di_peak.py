from fastapi.testclient import TestClient

from app.di_peak import DI_PEAK_PROX_PCT, compute_di_peak_flags
from app.main import app


def test_di_peak_uses_pivot_zones_not_rolling_max() -> None:
    series = [20.0, 21.0, 22.0, 23.0, 24.0, 25.0, 26.0]
    result = compute_di_peak_flags(series)
    assert result["last"] == 26.0
    assert result["zones"] == []
    assert result["peak"] is None
    assert result["is_peak"] is False


def test_di_peak_clusters_pivot_highs_and_flags_proximity() -> None:
    series = [20.0, 25.0, 34.0, 30.0, 28.0, 22.0, 24.0, 35.0, 33.0, 31.0, 34.0]
    result = compute_di_peak_flags(series)
    assert result["pivot_indices"] == [2, 7]
    assert result["pivot_values"] == [34.0, 35.0]
    assert len(result["zones"]) == 1
    assert result["zones"][0]["center"] == 34.5
    assert result["distance_pct"] < DI_PEAK_PROX_PCT
    assert result["is_peak"] is True
    assert result["in_peak_zone"] is True


def test_di_peak_rejects_current_di_outside_zone_proximity() -> None:
    series = [20.0, 25.0, 34.0, 30.0, 28.0, 22.0, 24.0, 35.0, 33.0, 31.0, 30.0]
    result = compute_di_peak_flags(series)
    assert result["zones"]
    assert result["distance_pct"] > DI_PEAK_PROX_PCT
    assert result["is_peak"] is False


def test_di_peak_endpoint() -> None:
    class FakeIngest:
        def list_indicators(self, symbol: str, tf: str, limit: int = 10):
            return {
                "candles": [{"close_time": idx * 1000} for idx in range(1, 12)],
                "di_plus": [20.0, 25.0, 34.0, 30.0, 28.0, 22.0, 24.0, 35.0, 33.0, 31.0, 34.0],
                "di_minus": [10.0, 11.0, 15.0, 12.0, 10.0, 9.0, 11.0, 15.0, 12.0, 10.0, 11.0],
                "adx14": [10.0, 20.0, 30.0],
            }

        def stop(self):
            return None

    with TestClient(app) as client:
        app.state.ingest = FakeIngest()
        resp = client.get("/api/di_peak/BTCUSDT/15m?window=11")
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["di_plus"]["is_peak"] is True
        assert payload["di_plus"]["zones"][0]["count"] == 2
        assert payload["di_minus"]["is_peak"] is False
        assert payload["not_at_peak_long"] is False
        assert payload["not_at_peak_short"] is True
        assert payload["adx14_last"] == 30.0
        assert payload["timestamp"] == 11000
