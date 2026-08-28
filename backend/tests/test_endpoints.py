from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURE = Path(__file__).parent / "fixtures" / "sample_two_layers.dxf"


def test_upload_returns_layers_and_flags_undetermined():
    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
        )

    assert response.status_code == 200
    body = response.json()

    layers_by_name = {layer["rawLayerName"]: layer for layer in body["layers"]}
    assert set(layers_by_name.keys()) == {"LAY_0725_EXT", "WALL_UNKNOWN_042"}

    determined = layers_by_name["LAY_0725_EXT"]
    assert determined["materialName"] == "Yellowish Green Interior"
    assert determined["linearMeters"] == 14.0

    undetermined = layers_by_name["WALL_UNKNOWN_042"]
    assert undetermined["materialName"] == "WALL_UNKNOWN_042"
    assert undetermined["linearMeters"] == 5.0

    assert body["undeterminedLayers"] == ["WALL_UNKNOWN_042"]


def test_upload_rejects_non_dxf_extension():
    response = client.post(
        "/api/upload",
        files={"file": ("notes.txt", b"hello world", "text/plain")},
    )
    assert response.status_code == 400


def test_upload_rejects_unparseable_dxf_content():
    response = client.post(
        "/api/upload",
        files={"file": ("broken.dxf", b"this is not a real dxf file", "application/dxf")},
    )
    assert response.status_code == 400


def test_upload_rejects_oversized_file(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "max_upload_size_mb", 0)  # 0 MB => anything is too big
    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
        )
    assert response.status_code == 413
