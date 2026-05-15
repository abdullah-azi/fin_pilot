from app.core.config import Settings


def test_deepseek_defaults_are_openai_compatible() -> None:
    settings = Settings(_env_file=None)

    assert settings.ai_provider == "deepseek"
    assert settings.ai_base_url == "https://api.deepseek.com"


def test_provider_specific_key_overrides_generic_key() -> None:
    settings = Settings(
        _env_file=None,
        ai_provider="deepseek",
        ai_api_key="generic-key",
        deepseek_api_key="deepseek-key",
    )

    assert settings.active_ai_api_key == "deepseek-key"
