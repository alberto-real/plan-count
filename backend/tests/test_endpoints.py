from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURE = Path(__file__).parent / "fixtures" / "sample_two_layers.dxf"


def _auth_headers(rsa_keypair, mock_jwks, make_token) -> dict[str, str]:
    private_key, jwk = rsa_keypair
    mock_jwks(jwk)
    token = make_token(private_key, jwk["kid"])
    return {"Authorization": f"Bearer {token}"}


def test_upload_returns_layers_and_flags_undetermined(rsa_keypair, mock_jwks, make_token):
    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
            headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
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


def test_upload_rejects_non_dxf_extension(rsa_keypair, mock_jwks, make_token):
    response = client.post(
        "/api/upload",
        files={"file": ("notes.txt", b"hello world", "text/plain")},
        headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
    )
    assert response.status_code == 400


def test_upload_rejects_unparseable_dxf_content(rsa_keypair, mock_jwks, make_token):
    response = client.post(
        "/api/upload",
        files={"file": ("broken.dxf", b"this is not a real dxf file", "application/dxf")},
        headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
    )
    assert response.status_code == 400


def test_upload_rejects_oversized_file(monkeypatch, rsa_keypair, mock_jwks, make_token):
    from app.config import settings

    monkeypatch.setattr(settings, "max_upload_size_mb", 0)  # 0 MB => anything is too big
    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
            headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
        )
    assert response.status_code == 413


def test_upload_missing_file_field_returns_400(rsa_keypair, mock_jwks, make_token):
    response = client.post("/api/upload", headers=_auth_headers(rsa_keypair, mock_jwks, make_token))
    assert response.status_code == 400


def test_upload_wrong_field_name_returns_400(rsa_keypair, mock_jwks, make_token):
    response = client.post(
        "/api/upload",
        files={"wrong_field_name": ("sample_two_layers.dxf", b"irrelevant", "application/dxf")},
        headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
    )
    assert response.status_code == 400


def test_upload_degrades_gracefully_when_naming_service_fails(monkeypatch, rsa_keypair, mock_jwks, make_token):
    from app.api import endpoints

    def _raise(self, raw_names):
        raise RuntimeError("naming service unavailable")

    monkeypatch.setattr(
        endpoints.StubLayerNamingService, "map_layer_names", _raise
    )

    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
            headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
        )

    assert response.status_code == 200
    body = response.json()

    layers_by_name = {layer["rawLayerName"]: layer for layer in body["layers"]}
    assert set(layers_by_name.keys()) == {"LAY_0725_EXT", "WALL_UNKNOWN_042"}

    assert layers_by_name["LAY_0725_EXT"]["materialName"] == "LAY_0725_EXT"
    assert layers_by_name["LAY_0725_EXT"]["linearMeters"] == 14.0

    assert layers_by_name["WALL_UNKNOWN_042"]["materialName"] == "WALL_UNKNOWN_042"
    assert layers_by_name["WALL_UNKNOWN_042"]["linearMeters"] == 5.0

    assert set(body["undeterminedLayers"]) == {"LAY_0725_EXT", "WALL_UNKNOWN_042"}


def test_upload_without_token_returns_401():
    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
        )
    assert response.status_code == 401
