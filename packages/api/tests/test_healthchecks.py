"""Smoke tests for the healthcheck endpoints."""
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": 200}


def test_read_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": 200}
