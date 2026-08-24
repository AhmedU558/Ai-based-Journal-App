import pytest
import app as app_module
import ai_providers


@pytest.fixture
def client(monkeypatch):
    # No LLM/HF providers configured in tests by default - every test runs
    # against the real, deterministic keyword/pattern fallback logic, not
    # network calls to Gemini/Claude/HuggingFace. Individual tests that need
    # to exercise the Gemini/HF branches set these back via monkeypatch and
    # mock requests.post themselves. GEMINI_API_KEY/ANTHROPIC_API_KEY live in
    # ai_providers.py (not app.py) since app.py splitting - patch them there,
    # not on app_module, or app.chat()'s ai_providers.GEMINI_API_KEY reads
    # would silently miss the patch.
    monkeypatch.setattr(ai_providers, "GEMINI_API_KEY", "")
    monkeypatch.setattr(ai_providers, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(app_module, "HF_API_KEY", "")
    app_module.app.config.update(TESTING=True)
    with app_module.app.test_client() as test_client:
        yield test_client
