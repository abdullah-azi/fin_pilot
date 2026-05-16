import pytest

from app.services.ai.openai_compatible import OpenAICompatibleProvider, extract_openai_compatible_text


def test_extract_openai_compatible_text_from_string_content() -> None:
    body = {
        "choices": [
            {
                "message": {
                    "content": "This purchase is safe for now.",
                }
            }
        ]
    }

    assert extract_openai_compatible_text(body) == "This purchase is safe for now."


def test_extract_openai_compatible_text_from_list_content() -> None:
    body = {
        "choices": [
            {
                "message": {
                    "content": [
                        {"type": "text", "text": "First line."},
                        {"type": "text", "text": "Second line."},
                    ]
                }
            }
        ]
    }

    assert extract_openai_compatible_text(body) == "First line.\nSecond line."


def test_openai_compatible_payload_includes_response_format() -> None:
    provider = OpenAICompatibleProvider(
        api_key="test-key",
        base_url="https://api.example.com",
        model_name="deepseek-v4-flash",
        provider_name="deepseek",
        timeout_seconds=10,
    )

    payload = provider._build_payload(
        messages=[{"role": "user", "content": "hello"}],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    assert payload["model"] == "deepseek-v4-flash"
    assert payload["messages"] == [{"role": "user", "content": "hello"}]
    assert payload["response_format"] == {"type": "json_object"}


def test_extract_openai_compatible_text_raises_without_choices() -> None:
    with pytest.raises(ValueError, match="choices"):
        extract_openai_compatible_text({})
