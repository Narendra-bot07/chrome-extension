import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_live_endpoint():
    """Test /live endpoint returns plain text Process is running."""
    response = client.get("/live")
    assert response.status_code == 200
    assert response.text == "Process is running."

def test_ready_endpoint():
    """Test /ready endpoint returns status and reachable message."""
    response = client.get("/ready")
    assert response.status_code == 200
    assert "Backend can serve traffic and required dependencies are reachable." in response.text

def test_health_endpoint():
    """Test /health endpoint returns structured health json summary."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "degraded"]
    assert "environment" in data
    assert "database" in data
    assert "redis" in data
    assert "storage" in data
    assert "version" in data

def test_v1_health_endpoints():
    """Test API v1 health prefix routes."""
    res_live = client.get("/api/v1/live")
    assert res_live.status_code == 200
    assert res_live.text == "Process is running."

    res_ready = client.get("/api/v1/ready")
    assert res_ready.status_code == 200

    res_health = client.get("/api/v1/health")
    assert res_health.status_code == 200
    data = res_health.json()
    assert "status" in data
