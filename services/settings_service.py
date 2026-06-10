"""Serviço de configurações da aplicação."""
import database

_DEFAULTS: dict[str, str] = {
    "default_device": "",
    "default_rate": "100",
    "history_limit": "20",
    "theme": "dark",
}

_ALLOWED_KEYS = set(_DEFAULTS.keys())


def get_settings() -> dict:
    stored = database.get_all_settings()
    return {key: stored.get(key, default) for key, default in _DEFAULTS.items()}


def update_settings(data: dict) -> dict:
    saved = {}
    for key, value in data.items():
        if key not in _ALLOWED_KEYS:
            continue
        database.set_setting(key, str(value))
        saved[key] = value
    return saved
