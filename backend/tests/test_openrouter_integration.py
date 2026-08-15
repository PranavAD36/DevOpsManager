import asyncio
import json
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.services.ai_service import AIProviderError, _call_openrouter, analyze_repository_content


def test_openrouter_missing_api_key(monkeypatch) -> None:
    async def execute() -> None:
        monkeypatch.setattr(settings, "openrouter_api_key", None)
        monkeypatch.setattr(settings, "ai_provider", "openrouter")

        with pytest.raises(AIProviderError, match="OPENROUTER_API_KEY is not configured"):
            await analyze_repository_content(
                repository_name="octocat/hello-world",
                language="Python",
                files=[SimpleNamespace(path="app.py", content="print('hello')")],
                provider="openrouter",
            )

    asyncio.run(execute())


@pytest.mark.parametrize(
    ("status_code", "expected_error"),
    [
        (401, "OpenRouter authentication failed"),
        (429, "OpenRouter rate limit exceeded"),
        (404, "OpenRouter model unavailable"),
        (422, "OpenRouter model unavailable"),
    ],
)
def test_openrouter_http_error_mapping(monkeypatch, status_code: int, expected_error: str) -> None:
    async def execute() -> None:
        monkeypatch.setattr(settings, "openrouter_api_key", "test-key")

        class FakeResponse:
            def __init__(self, code: int):
                self.status_code = code
                self.is_error = True

            def json(self):
                return {}

        class FakeClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return None

            async def post(self, *args, **kwargs):
                return FakeResponse(status_code)

        monkeypatch.setattr("app.services.ai_service.httpx.AsyncClient", FakeClient)

        with pytest.raises(AIProviderError, match=expected_error):
            await _call_openrouter("test prompt")

    asyncio.run(execute())


def test_openrouter_invalid_response_shape(monkeypatch) -> None:
    async def execute() -> None:
        monkeypatch.setattr(settings, "openrouter_api_key", "test-key")

        class FakeResponse:
            status_code = 200
            is_error = False

            def json(self):
                return {"choices": []}

        class FakeClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return None

            async def post(self, *args, **kwargs):
                return FakeResponse()

        monkeypatch.setattr("app.services.ai_service.httpx.AsyncClient", FakeClient)

        with pytest.raises(AIProviderError, match="OpenRouter returned an invalid response"):
            await _call_openrouter("test prompt")

    asyncio.run(execute())


def test_openrouter_success_response_parsing(monkeypatch) -> None:
    async def execute() -> None:
        monkeypatch.setattr(settings, "openrouter_api_key", "test-key")
        monkeypatch.setattr(settings, "openrouter_model", "meta-llama/llama-3.1-8b-instruct:free")

        structured = {
            "summary": "Found one quality issue",
            "issues": [
                {
                    "title": "Avoid print statements",
                    "description": "Use structured logging in service code.",
                    "severity": "low",
                    "category": "quality",
                    "file_path": "app.py",
                    "line_number": 1,
                    "suggested_fix": "Replace print with logging.info",
                    "corrected_code": "import logging\\nlogging.info('hello')",
                }
            ],
        }

        class FakeResponse:
            status_code = 200
            is_error = False

            def json(self):
                return {
                    "choices": [
                        {"message": {"content": json.dumps(structured)}}
                    ]
                }

        class FakeClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return None

            async def post(self, *args, **kwargs):
                return FakeResponse()

        monkeypatch.setattr("app.services.ai_service.httpx.AsyncClient", FakeClient)

        result = await analyze_repository_content(
            repository_name="octocat/hello-world",
            language="Python",
            files=[SimpleNamespace(path="app.py", content="print('hello')")],
            provider="openrouter",
        )
        assert result.summary == structured["summary"]
        assert len(result.issues) == 1
        assert result.issues[0].title == "Avoid print statements"
        assert result.issues[0].suggested_fix == "Replace print with logging.info"

    asyncio.run(execute())
