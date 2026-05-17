from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from .config import get_data_dir


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class TelegramSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    enabled: bool = False
    bot_token: str = ""
    chat_id: str = ""

    @field_validator("bot_token", "chat_id", mode="before")
    @classmethod
    def normalize_str(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value).strip()


class TelegramSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    enabled: bool | None = None
    bot_token: str | None = Field(default=None)
    chat_id: str | None = None
    clear_bot_token: bool = False

    @field_validator("bot_token", "chat_id", mode="before")
    @classmethod
    def normalize_str(cls, value: object) -> str | None:
        if value is None:
            return None
        return str(value).strip()


def get_telegram_settings_path() -> Path:
    return get_data_dir() / "telegram_settings.json"


def _env_settings() -> TelegramSettings:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    enabled = _env_bool("TELEGRAM_ENABLED", bool(token and chat_id))
    return TelegramSettings(enabled=enabled, bot_token=token, chat_id=chat_id)


def _load_file_settings(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def load_telegram_settings(path: Path | None = None) -> TelegramSettings:
    path = path or get_telegram_settings_path()
    base = _env_settings().model_dump()
    base.update(_load_file_settings(path))
    try:
        return TelegramSettings.model_validate(base)
    except ValidationError:
        return _env_settings()


def save_telegram_settings(settings: TelegramSettings, path: Path | None = None) -> TelegramSettings:
    path = path or get_telegram_settings_path()
    settings = TelegramSettings.model_validate(settings.model_dump())
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(settings.model_dump(), indent=2)
    with tempfile.NamedTemporaryFile("w", delete=False, dir=path.parent, encoding="utf-8") as tmp:
        tmp.write(payload)
        tmp_path = Path(tmp.name)
    os.replace(tmp_path, path)
    return settings


def telegram_settings_public(settings: TelegramSettings) -> dict[str, object]:
    return {
        "enabled": settings.enabled,
        "chat_id": settings.chat_id,
        "has_bot_token": bool(settings.bot_token),
    }
