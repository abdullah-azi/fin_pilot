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


def test_resend_enabled_requires_api_key_and_sender() -> None:
    disabled = Settings(_env_file=None)
    enabled = Settings(
        _env_file=None,
        resend_api_key="re_test_key",
        resend_from_email="FinPilot <onboarding@resend.dev>",
    )

    assert disabled.resend_enabled is False
    assert enabled.resend_enabled is True


def test_database_urls_normalize_to_psycopg_driver() -> None:
    settings_from_postgres = Settings(
        _env_file=None,
        database_url="postgres://user:pass@db.example.com:5432/finpilot",
        test_database_url="postgresql://user:pass@db.example.com:5432/finpilot_test",
    )

    assert settings_from_postgres.database_url == "postgresql+psycopg://user:pass@db.example.com:5432/finpilot"
    assert settings_from_postgres.test_database_url == "postgresql+psycopg://user:pass@db.example.com:5432/finpilot_test"
