from fastapi.testclient import TestClient

from app.main import app


class FakeNotifier:
    def __init__(self) -> None:
        self.sent_text = None

    def send_telegram(self, text: str):
        self.sent_text = text
        return True, None


def test_telegram_test_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    headers = {"Authorization": "Bearer test-token"}
    with TestClient(app) as client:
        fake = FakeNotifier()
        app.state.notifier = fake
        response = client.post("/api/telegram/test", json={"text": "hello"}, headers=headers)
        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is True
        assert payload["sent_text"] == "hello"
        assert fake.sent_text == "hello"


def test_telegram_settings_endpoint_saves_without_exposing_token(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    headers = {"Authorization": "Bearer test-token"}

    with TestClient(app) as client:
        response = client.put(
            "/api/telegram/settings",
            json={"enabled": True, "bot_token": "123:secret-token", "chat_id": "-100123"},
            headers=headers,
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["telegram"] == {"enabled": True, "chat_id": "-100123", "has_bot_token": True}
        assert "secret-token" not in response.text

        response = client.get("/api/telegram/settings", headers=headers)
        assert response.status_code == 200
        assert response.json() == {"enabled": True, "chat_id": "-100123", "has_bot_token": True}

        response = client.put(
            "/api/telegram/settings",
            json={"enabled": False, "bot_token": "", "chat_id": "-100456"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["telegram"] == {"enabled": False, "chat_id": "-100456", "has_bot_token": True}
