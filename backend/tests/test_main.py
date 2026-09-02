from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_rejects_origin_not_in_allowlist(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "cors_allowed_origin", "https://plan-count.albertoreal.com")

    # Need to recreate app and client with the new settings
    import importlib
    import app.main
    importlib.reload(app.main)
    test_client = TestClient(app.main.app)

    response = test_client.options(
        "/api/upload",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in {k.lower() for k in response.headers}


def test_cors_allows_configured_production_origin(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "cors_allowed_origin", "https://plan-count.albertoreal.com")

    # Need to recreate app and client with the new settings
    import importlib
    import app.main
    importlib.reload(app.main)
    test_client = TestClient(app.main.app)

    response = test_client.options(
        "/api/upload",
        headers={
            "Origin": "https://plan-count.albertoreal.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.headers["access-control-allow-origin"] == "https://plan-count.albertoreal.com"


def test_cors_allows_localhost_dev_origin_even_when_prod_origin_is_configured(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "cors_allowed_origin", "https://plan-count.albertoreal.com")

    # Need to recreate app and client with the new settings
    import importlib
    import app.main
    importlib.reload(app.main)
    test_client = TestClient(app.main.app)

    response = test_client.options(
        "/api/upload",
        headers={
            "Origin": "http://localhost:4200",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:4200"
