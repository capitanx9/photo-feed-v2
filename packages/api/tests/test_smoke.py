import os

import django
import pytest

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "api.settings")
django.setup()


def test_imports() -> None:
    import api  # noqa: F401
    import common  # noqa: F401
    import users  # noqa: F401


@pytest.fixture
def client():  # type: ignore[no-untyped-def]
    from django.test import Client

    return Client()


def test_health_endpoint(client) -> None:  # type: ignore[no-untyped-def]
    resp = client.get("/api/health/")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_schema_endpoint(client) -> None:  # type: ignore[no-untyped-def]
    resp = client.get("/api/schema/")
    assert resp.status_code == 200
    body = resp.content.decode()
    assert "openapi:" in body
    assert "photo-feed API" in body


def test_swagger_ui_endpoint(client) -> None:  # type: ignore[no-untyped-def]
    resp = client.get("/api/schema/swagger-ui/")
    assert resp.status_code == 200
    assert b"swagger" in resp.content.lower()
