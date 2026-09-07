from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.models import LegendEntry, StyleGroup

client = TestClient(app)
FIXTURE = Path(__file__).parent / "fixtures" / "sample_two_layers.dxf"


def _auth_headers(rsa_keypair, mock_jwks, make_token) -> dict[str, str]:
    private_key, jwk = rsa_keypair
    mock_jwks(jwk)
    token = make_token(private_key, jwk["kid"])
    return {"Authorization": f"Bearer {token}"}


def _build_legend_dxf(tmp_path) -> Path:
    import ezdxf

    doc = ezdxf.new()
    msp = doc.modelspace()
    msp.add_mtext("{\\fArial|b1|i0|c0|p34;R1}", dxfattribs={"insert": (0, 10, 0)})
    msp.add_mtext("Wall A: some technical detail", dxfattribs={"insert": (0.4, 10.1, 0)})
    msp.add_lwpolyline([(0, 9.8), (0.4, 9.8)], dxfattribs={"layer": "0", "color": 1})
    path = tmp_path / "legend.dxf"
    doc.saveas(path)
    return path


def test_legend_endpoint_extracts_entries_from_dxf_geometry(tmp_path, rsa_keypair, mock_jwks, make_token):
    dxf_path = _build_legend_dxf(tmp_path)

    with open(dxf_path, "rb") as f:
        response = client.post(
            "/api/legend",
            files={"file": ("legend.dxf", f, "application/dxf")},
            headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body["entries"]) == 1
    assert body["entries"][0]["key"] == "R1"
    assert body["entries"][0]["label"] == "Wall A"


def test_legend_endpoint_returns_400_when_no_legend_rows_found(rsa_keypair, mock_jwks, make_token):
    with open(FIXTURE, "rb") as f:  # sample_two_layers.dxf has geometry but no legend text at all
        response = client.post(
            "/api/legend",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
            headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
        )

    assert response.status_code == 400


def test_legend_endpoint_rejects_non_dxf_extension(rsa_keypair, mock_jwks, make_token):
    response = client.post(
        "/api/legend",
        files={"file": ("notes.txt", b"hello world", "text/plain")},
        headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
    )
    assert response.status_code == 400


def test_upload_matches_and_flags_undetermined(rsa_keypair, mock_jwks, make_token):
    # Both of sample_two_layers.dxf's entities (LAY_0725_EXT at 14.0m,
    # WALL_UNKNOWN_042 at 5.0m) resolve to the same effective style —
    # ("#ffffff", "CONTINUOUS", -3) — so a single legend entry matching
    # that style matches both style groups, summing to 19.0m with nothing
    # left undetermined.
    legend = [
        LegendEntry(key="R1", label="Wall A", colorHex="#ffffff", linetype="CONTINUOUS", lineweight=-3, isDashed=False),
    ]

    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
            data={"legend": json.dumps([e.model_dump() for e in legend])},
            headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body["matched"]) == 1
    assert body["matched"][0]["key"] == "R1"
    assert body["matched"][0]["linearMeters"] == 19.0  # both fixture layers share this style -> summed
    assert body["undetermined"] == []
    assert body["detectedUnit"] == "m"  # sample_two_layers.dxf's $INSUNITS is 6 (meters)


def test_upload_flags_undetermined_when_legend_style_does_not_match(rsa_keypair, mock_jwks, make_token):
    # sample_two_layers.dxf's entities resolve to a single effective style —
    # ("#ffffff", "CONTINUOUS", -3), summing to 19.0m. A legend entry whose
    # linetype/lineweight don't match that style leaves it unmatched, so it
    # must be reported as undetermined rather than silently dropped.
    legend = [
        LegendEntry(key="R1", label="Wall A", colorHex="#ffffff", linetype="DASHED", lineweight=25, isDashed=True),
    ]

    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
            data={"legend": json.dumps([e.model_dump() for e in legend])},
            headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["matched"] == []
    assert body["undetermined"] == [
        {"colorHex": "#ffffff", "linetype": "CONTINUOUS", "lineweight": -3, "linearMeters": 19.0, "isDashed": False}
    ]


def test_upload_reports_detected_unit_from_insunits(tmp_path, rsa_keypair, mock_jwks, make_token):
    import ezdxf

    doc = ezdxf.new()
    doc.header["$INSUNITS"] = 4  # millimeters
    msp = doc.modelspace()
    msp.add_line((0, 0), (10, 0), dxfattribs={"layer": "0", "color": 7})
    dxf_path = tmp_path / "mm_plan.dxf"
    doc.saveas(dxf_path)

    with open(dxf_path, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("mm_plan.dxf", f, "application/dxf")},
            data={"legend": "[]"},
            headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
        )

    assert response.status_code == 200
    assert response.json()["detectedUnit"] == "mm"


def test_upload_rejects_malformed_legend_color_hex(rsa_keypair, mock_jwks, make_token):
    legend = [
        {"key": "R1", "label": "Wall A", "colorHex": "not-a-hex", "linetype": "CONTINUOUS", "lineweight": -3},
    ]

    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
            data={"legend": json.dumps(legend)},
            headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
        )

    assert response.status_code == 400


def test_upload_rejects_malformed_legend_json(rsa_keypair, mock_jwks, make_token):
    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
            data={"legend": "not json"},
            headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
        )
    assert response.status_code == 400


def test_upload_rejects_non_dxf_extension(rsa_keypair, mock_jwks, make_token):
    response = client.post(
        "/api/upload",
        files={"wrong_field_name": ("notes.txt", b"hello", "text/plain")},
        data={"legend": "[]"},
        headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
    )
    assert response.status_code == 400


def test_upload_rejects_oversized_file(monkeypatch, rsa_keypair, mock_jwks, make_token):
    from app.config import settings

    monkeypatch.setattr(settings, "max_upload_size_mb", 0)
    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
            data={"legend": "[]"},
            headers=_auth_headers(rsa_keypair, mock_jwks, make_token),
        )
    assert response.status_code == 413


def test_upload_without_token_returns_401():
    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
            data={"legend": "[]"},
        )
    assert response.status_code == 401


def test_legend_endpoint_without_token_returns_401():
    with open(FIXTURE, "rb") as f:
        response = client.post("/api/legend", files={"file": ("legend.dxf", f, "application/dxf")})
    assert response.status_code == 401
