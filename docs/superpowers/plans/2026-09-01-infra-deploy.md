# Infra + Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the two placeholder Dockerfiles into a real, production-usable `docker-compose.yml` stack (frontend + backend behind nginx), add JWT bearer-token verification to `/api/upload` with a matching frontend interceptor, and add a GitHub Actions workflow that deploys to the existing OCI VM — closing the access-control gap before this app can be exposed publicly.

**Architecture:** Two Docker services on one internal bridge network. `frontend` is an nginx container that serves the compiled Angular build and reverse-proxies `/api/*` to `backend`; nginx's `try_files` fallback keeps the Angular router's deep links working. `backend` is unpublished (reachable only from `frontend`) and gains a `verify_token` FastAPI dependency that checks a bearer token's RS256 signature against Keycloak's JWKS, its issuer, and its `azp` claim, wired onto `/api/upload` only. The frontend gains a functional `HttpInterceptorFn` that attaches `Authorization: Bearer <token>` to `/api/*` requests, reading the token from a new `AuthService.getAccessToken()` method — `AuthService` remains the only file that imports `angular-oauth2-oidc` directly.

**Tech Stack:** Docker Compose, nginx (`nginx:alpine`), FastAPI + `PyJWT[crypto]` (JWKS-based RS256 verification), Angular 22 functional `HttpInterceptorFn`, GitHub Actions (SSH deploy to an existing OCI VM, mirroring the `pokemon-game` repo's workflow).

**Spec:** `docs/superpowers/specs/2026-09-01-infra-deploy-design.md`

## Global Constraints

- Production only — no staging/dev environment (spec §1).
- No new Keycloak realm role; any authenticated user in the `albertoreal` realm may use the app (spec §1).
- No new `github-deploy` VM user — reuse the existing `ubuntu` user and SSH key pattern already proven by `pokemon-game` (spec §1).
- No PKCE-required enforcement on the Keycloak client in this pass — `angular-oauth2-oidc` already sends the PKCE challenge by default (spec §1, §2).
- The Keycloak client `plan-count-frontend` already exists (public client, Standard flow only, redirect URI `https://plan-count.albertoreal.com/app`) — no code in this plan creates it (spec §2).
- No database, no persistent volume — the backend stays stateless (spec §3.1).
- `verify_token` is wired onto `POST /api/upload` only — no other endpoint changes (spec §3.3).
- `AuthService` remains the only file importing `angular-oauth2-oidc` directly; `UploadService` needs no changes — the interceptor is transparent to it (spec §3.4, §4 of the auth-i18n spec).
- CORS is a defense-in-depth layer, not the access-control mechanism — the JWT check is (spec §3.3).
- No integration test hits the real Keycloak instance or the real deployed VM from CI; JWT tests use a locally-generated RSA keypair standing in for Keycloak's JWKS (spec §7).
- No automatic rollback on a failed deploy or failed smoke test — matches existing `pokemon-game`/`albertoreal-ui` precedent (spec §6, §8).

---

## Task 1: Backend — restrict CORS via settings

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/test_main.py`

**Interfaces:**
- Produces: `Settings.cors_allowed_origin: str` (env var `CORS_ALLOWED_ORIGIN`, default `"http://localhost:4200"` for local dev).

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_main.py` (create the file with this content if it does not already contain a similar test — check the existing file first and append if it has other content):

```python
def test_cors_rejects_origin_not_in_allowlist(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "cors_allowed_origin", "https://plan-count.albertoreal.com")

    response = client.options(
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

    response = client.options(
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

    response = client.options(
        "/api/upload",
        headers={
            "Origin": "http://localhost:4200",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:4200"
```

If `backend/tests/test_main.py` doesn't exist yet, create it with these imports at the top:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend
pip install -r requirements.txt
pytest tests/test_main.py -v
```

Expected: the three new tests `FAIL` — the app currently sets `allow_origins=["*"]`, so `access-control-allow-origin` comes back as `*`, not a specific echoed origin, and the "rejects" test fails because CORS middleware currently allows every origin.

- [ ] **Step 3: Add `cors_allowed_origin` to `Settings`**

In `backend/app/config.py`, add the field:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    openrouter_api_key: str = "stub-key"
    max_upload_size_mb: int = 20
    cors_allowed_origin: str = "http://localhost:4200"


settings = Settings()
```

- [ ] **Step 4: Restrict `CORSMiddleware` to the configured origins**

In `backend/app/main.py`, replace the `CORSMiddleware` registration:

```python
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.endpoints import router as api_router
from app.config import settings

app = FastAPI(title="PlanCount Backend")

# CORS is a defense-in-depth layer here, not the access-control mechanism —
# `verify_token` (see auth_service.py) is. `localhost:4200` is always
# allowed so `ng serve`'s dev proxy keeps working regardless of what
# CORS_ALLOWED_ORIGIN is set to.
_DEV_ORIGIN = "http://localhost:4200"
app.add_middleware(
    CORSMiddleware,
    allow_origins=list({settings.cors_allowed_origin, _DEV_ORIGIN}),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": "Missing or invalid file field"})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pytest tests/test_main.py -v
```

Expected: `PASS`.

- [ ] **Step 6: Document the new env var**

Update `backend/.env.example`:

```
OPENROUTER_API_KEY=stub-key
MAX_UPLOAD_SIZE_MB=20
CORS_ALLOWED_ORIGIN=http://localhost:4200
```

- [ ] **Step 7: Run the full backend test suite**

```bash
pytest -v
```

Expected: `PASS` — no regressions in `test_endpoints.py`, `test_dxf_service.py`, `test_llm_service.py`.

- [ ] **Step 8: Commit**

```bash
git add backend/app/config.py backend/app/main.py backend/.env.example backend/tests/test_main.py
git commit -m "feat(backend): restrict CORS to a configured origin allowlist"
```

---

## Task 2: Backend — JWT verification service and shared test fixtures

**Files:**
- Create: `backend/app/services/auth_service.py`
- Modify: `backend/conftest.py`
- Create: `backend/tests/test_auth_service.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Produces: `verify_token(request: Request) -> None` (raises `HTTPException(401)` on any failure; returns `None` on success) — a plain FastAPI dependency, importable as `from app.services.auth_service import verify_token`.
- Produces (test-only, via `conftest.py`, no import needed — pytest fixture autodiscovery): fixtures `rsa_keypair`, `mock_jwks`, `make_token`, and an autouse fixture that resets `auth_service`'s in-memory JWKS cache before every test.

- [ ] **Step 1: Add the new dependency**

In `backend/requirements.txt`, add a line (keep the existing lines unchanged):

```
PyJWT[crypto]>=2.8,<3.0
```

Install it:

```bash
cd backend
pip install -r requirements.txt
```

- [ ] **Step 2: Write the shared JWT test fixtures**

Replace the content of `backend/conftest.py` (currently just a comment) with:

```python
"""Shared pytest fixtures for JWT-based auth tests. Also anchors pytest's
import root at backend/, so `import app...` works from any test location.
"""

import base64
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.services import auth_service


def _b64url_uint(value: int) -> str:
    byte_length = (value.bit_length() + 7) // 8
    raw = value.to_bytes(byte_length, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


@pytest.fixture
def rsa_keypair():
    """A (private_key, jwk) pair standing in for one of Keycloak's JWKS
    signing keys. `jwk["kid"]` is always `"test-kid"`."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_numbers = private_key.public_key().public_numbers()
    jwk = {
        "kty": "RSA",
        "kid": "test-kid",
        "use": "sig",
        "alg": "RS256",
        "n": _b64url_uint(public_numbers.n),
        "e": _b64url_uint(public_numbers.e),
    }
    return private_key, jwk


@pytest.fixture(autouse=True)
def _reset_jwks_cache():
    auth_service._jwks_cache["keys"] = {}
    auth_service._jwks_cache["fetched_at"] = 0.0


@pytest.fixture
def mock_jwks(monkeypatch):
    """Call with a jwk dict (from `rsa_keypair`) to make `auth_service`'s
    JWKS fetch return it instead of making a real network call."""

    def _install(jwk: dict) -> None:
        class _FakeResponse:
            def raise_for_status(self) -> None:
                pass

            def json(self) -> dict:
                return {"keys": [jwk]}

        def _fake_get(url: str, timeout: float = 5.0) -> _FakeResponse:
            return _FakeResponse()

        monkeypatch.setattr(auth_service.httpx, "get", _fake_get)

    return _install


@pytest.fixture
def make_token():
    """Call with (private_key, kid, **claim_overrides) to mint a signed
    RS256 token with sane defaults for iss/azp/iat/exp."""

    def _make(private_key, kid: str, **claim_overrides) -> str:
        now = int(time.time())
        claims = {
            "iss": auth_service._ISSUER,
            "azp": auth_service._CLIENT_ID,
            "iat": now,
            "exp": now + 300,
            **claim_overrides,
        }
        return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": kid})

    return _make
```

- [ ] **Step 3: Write the failing tests**

Create `backend/tests/test_auth_service.py`:

```python
from fastapi import HTTPException
import pytest

from app.services import auth_service


class _FakeRequest:
    def __init__(self, headers: dict[str, str]):
        self.headers = headers


def test_valid_token_is_accepted(rsa_keypair, mock_jwks, make_token):
    private_key, jwk = rsa_keypair
    mock_jwks(jwk)
    token = make_token(private_key, jwk["kid"])

    result = auth_service.verify_token(_FakeRequest({"Authorization": f"Bearer {token}"}))

    assert result is None


def test_expired_token_is_rejected(rsa_keypair, mock_jwks, make_token):
    private_key, jwk = rsa_keypair
    mock_jwks(jwk)
    now = int(__import__("time").time())
    token = make_token(private_key, jwk["kid"], iat=now - 600, exp=now - 300)

    with pytest.raises(HTTPException) as exc_info:
        auth_service.verify_token(_FakeRequest({"Authorization": f"Bearer {token}"}))
    assert exc_info.value.status_code == 401


def test_wrong_issuer_is_rejected(rsa_keypair, mock_jwks, make_token):
    private_key, jwk = rsa_keypair
    mock_jwks(jwk)
    token = make_token(private_key, jwk["kid"], iss="https://evil.example.com/realms/other")

    with pytest.raises(HTTPException) as exc_info:
        auth_service.verify_token(_FakeRequest({"Authorization": f"Bearer {token}"}))
    assert exc_info.value.status_code == 401


def test_wrong_azp_is_rejected(rsa_keypair, mock_jwks, make_token):
    private_key, jwk = rsa_keypair
    mock_jwks(jwk)
    token = make_token(private_key, jwk["kid"], azp="some-other-client")

    with pytest.raises(HTTPException) as exc_info:
        auth_service.verify_token(_FakeRequest({"Authorization": f"Bearer {token}"}))
    assert exc_info.value.status_code == 401


def test_missing_header_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        auth_service.verify_token(_FakeRequest({}))
    assert exc_info.value.status_code == 401


def test_malformed_header_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        auth_service.verify_token(_FakeRequest({"Authorization": "NotBearer sometoken"}))
    assert exc_info.value.status_code == 401


def test_unknown_kid_is_rejected(rsa_keypair, mock_jwks, make_token):
    private_key, jwk = rsa_keypair
    mock_jwks(jwk)
    token = make_token(private_key, "a-kid-not-in-the-jwks")

    with pytest.raises(HTTPException) as exc_info:
        auth_service.verify_token(_FakeRequest({"Authorization": f"Bearer {token}"}))
    assert exc_info.value.status_code == 401
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
pytest tests/test_auth_service.py -v
```

Expected: `FAIL` with `ModuleNotFoundError: No module named 'app.services.auth_service'` (or a collection error) — the module doesn't exist yet.

- [ ] **Step 5: Write `auth_service.py`**

Create `backend/app/services/auth_service.py`:

```python
from __future__ import annotations

import time

import httpx
import jwt
from fastapi import HTTPException, Request

_ISSUER = "https://auth.albertoreal.com/realms/albertoreal"
_JWKS_URL = f"{_ISSUER}/protocol/openid-connect/certs"
_CLIENT_ID = "plan-count-frontend"
_JWKS_CACHE_TTL_SECONDS = 300

# In-memory JWKS cache: {"keys": {kid: jwk}, "fetched_at": monotonic_seconds}.
# Refetched on a kid cache-miss (handles Keycloak's own key rotation) or
# once the TTL expires, so a redeploy is never required to pick up a
# rotated signing key.
_jwks_cache: dict[str, object] = {"keys": {}, "fetched_at": 0.0}

_UNAUTHORIZED = HTTPException(status_code=401, detail="Invalid authentication token")


def _fetch_jwks() -> dict[str, dict]:
    response = httpx.get(_JWKS_URL, timeout=5.0)
    response.raise_for_status()
    keys = {key["kid"]: key for key in response.json()["keys"]}
    _jwks_cache["keys"] = keys
    _jwks_cache["fetched_at"] = time.monotonic()
    return keys


def _get_signing_key(kid: str) -> dict:
    keys: dict[str, dict] = _jwks_cache["keys"]  # type: ignore[assignment]
    is_stale = time.monotonic() - _jwks_cache["fetched_at"] > _JWKS_CACHE_TTL_SECONDS  # type: ignore[operator]
    if kid not in keys or is_stale:
        keys = _fetch_jwks()
    if kid not in keys:
        raise _UNAUTHORIZED
    return keys[kid]


def verify_token(request: Request) -> None:
    """FastAPI dependency: raises HTTPException(401) unless `request`
    carries a valid `Authorization: Bearer <token>` header — RS256
    signature verified against Keycloak's (cached) JWKS, issuer and
    expiry checked, and `azp` matched against this app's client ID.

    Keycloak's public clients carry the client ID in `azp`, not `aud`,
    by default — verified against a real token once the flow is
    exercised end-to-end. If Keycloak turns out to populate `aud`
    instead for this client, checking `aud` here is an equivalent fix.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise _UNAUTHORIZED

    token = auth_header.removeprefix("Bearer ")

    try:
        kid = jwt.get_unverified_header(token)["kid"]
        signing_key = jwt.PyJWK.from_dict(_get_signing_key(kid)).key
        claims = jwt.decode(
            token,
            key=signing_key,
            algorithms=["RS256"],
            issuer=_ISSUER,
            options={"verify_aud": False},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise _UNAUTHORIZED from exc

    if claims.get("azp") != _CLIENT_ID:
        raise _UNAUTHORIZED
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pytest tests/test_auth_service.py -v
```

Expected: `PASS` (all 7 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/conftest.py backend/app/services/auth_service.py backend/tests/test_auth_service.py
git commit -m "feat(backend): add JWT bearer-token verification against Keycloak JWKS"
```

---

## Task 3: Backend — wire `verify_token` onto `/api/upload`

**Files:**
- Modify: `backend/app/api/endpoints.py`
- Modify: `backend/tests/test_endpoints.py`

**Interfaces:**
- Consumes: `verify_token` from `app.services.auth_service` (Task 2), `rsa_keypair` / `mock_jwks` / `make_token` fixtures from `conftest.py` (Task 2).

- [ ] **Step 1: Update `test_endpoints.py` to authenticate every existing test, and add the new 401 test**

Replace the top of `backend/tests/test_endpoints.py` (imports and the `FIXTURE` constant stay; add an `_auth_headers` helper) and add bearer-token headers to every existing `client.post("/api/upload", ...)` call:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pytest tests/test_endpoints.py -v
```

Expected: the new `test_upload_without_token_returns_401` `FAILs` (still returns 400, for the missing-file-field reason, since `verify_token` isn't wired yet); every other test still `PASSes` unauthenticated (they'll keep passing until Step 3, since nothing enforces the token yet — this step's real purpose is locking in the 401 test as red before Step 3 makes it green).

- [ ] **Step 3: Wire `verify_token` onto the endpoint**

In `backend/app/api/endpoints.py`, add the dependency:

```python
from __future__ import annotations

import tempfile
from pathlib import Path

from ezdxf import DXFStructureError
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.config import settings
from app.models import LayerResult, UploadResponse
from app.services.auth_service import verify_token
from app.services.dxf_service import compute_layer_lengths
from app.services.llm_service import LayerNamingService, StubLayerNamingService

router = APIRouter()

_naming_service: LayerNamingService = StubLayerNamingService()


@router.post("/upload", response_model=UploadResponse, dependencies=[Depends(verify_token)])
async def upload_dxf(file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith(".dxf"):
        raise HTTPException(status_code=400, detail="Only .dxf files are supported")

    contents = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {settings.max_upload_size_mb}MB",
        )

    tmp_path = _write_temp_dxf(contents)
    try:
        lengths = compute_layer_lengths(tmp_path)
    except (DXFStructureError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid DXF") from exc
    finally:
        tmp_path.unlink(missing_ok=True)

    return _build_response(lengths)


def _write_temp_dxf(contents: bytes) -> Path:
    with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as tmp:
        tmp.write(contents)
        return Path(tmp.name)


def _build_response(lengths: dict[str, float]) -> UploadResponse:
    raw_names = list(lengths.keys())

    try:
        material_map = _naming_service.map_layer_names(raw_names)
    except Exception:
        # A naming-service failure must never block the measurement
        # result: degrade to "everything undetermined" instead of
        # raising, since the linear-meter data is still valid.
        material_map = {}

    layers: list[LayerResult] = []
    undetermined: list[str] = []

    for raw_name, meters in lengths.items():
        material_name = material_map.get(raw_name)
        if material_name is None:
            material_name = raw_name
            undetermined.append(raw_name)
        layers.append(
            LayerResult(
                rawLayerName=raw_name,
                materialName=material_name,
                linearMeters=round(meters, 3),
            )
        )

    return UploadResponse(layers=layers, undeterminedLayers=undetermined)
```

(Only the `router.post` decorator and the `import` line changed — everything else in the file is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pytest tests/test_endpoints.py -v
```

Expected: `PASS` (all 8 tests, including the new 401 test).

- [ ] **Step 5: Run the full backend test suite**

```bash
pytest -v
```

Expected: `PASS`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/endpoints.py backend/tests/test_endpoints.py
git commit -m "feat(backend): require a valid bearer token on POST /api/upload"
```

---

## Task 4: Backend — harden `Dockerfile`

**Files:**
- Modify: `backend/Dockerfile`

**Interfaces:**
- Produces: a backend image listening on `8000`, running as a non-root user, matching `docker-compose.yml`'s expectation (Task 7) that it's reachable at `http://backend:8000` inside the compose network.

- [ ] **Step 1: Replace the stub Dockerfile with the hardened version**

Replace `backend/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.11.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --system --home /app --shell /usr/sbin/nologin appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Build the image to verify it still works**

```bash
cd backend
docker build -t plan-count-backend-test .
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Run the container standalone and hit `/health`**

```bash
docker run --rm -d -p 18000:8000 --name plan-count-backend-test plan-count-backend-test
sleep 2
curl -sS http://localhost:18000/health
docker stop plan-count-backend-test
```

Expected: `curl` prints `{"status":"ok"}`.

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile
git commit -m "feat(backend): harden Dockerfile — pinned base image, non-root user"
```

---

## Task 5: Frontend — auth interceptor

**Files:**
- Modify: `frontend/src/app/core/auth/auth.service.ts`
- Create: `frontend/src/app/core/auth/auth.interceptor.ts`
- Create: `frontend/src/app/core/auth/auth.interceptor.spec.ts`
- Modify: `frontend/src/app/app.config.ts`

**Interfaces:**
- Consumes: `AuthService` (existing, from `auth.service.ts`).
- Produces: `AuthService.getAccessToken(): string | null` (new method). `authInterceptor: HttpInterceptorFn`, importable from `./auth.interceptor`.

- [ ] **Step 1: Write the failing interceptor spec**

Create `frontend/src/app/core/auth/auth.interceptor.spec.ts`:

```typescript
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

class FakeAuthService {
  getAccessToken(): string | null {
    return null;
  }
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let fakeAuthService: FakeAuthService;

  beforeEach(() => {
    fakeAuthService = new FakeAuthService();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: fakeAuthService },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('adds the Authorization header for /api/ requests when a token is present', () => {
    fakeAuthService.getAccessToken = () => 'the-token';

    http.get('/api/upload').subscribe();

    const req = httpMock.expectOne('/api/upload');
    expect(req.request.headers.get('Authorization')).toBe('Bearer the-token');
    req.flush({});
  });

  it('omits the Authorization header for /api/ requests when no token is present', () => {
    http.get('/api/upload').subscribe();

    const req = httpMock.expectOne('/api/upload');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('leaves non-/api/ requests untouched even when a token is present', () => {
    fakeAuthService.getAccessToken = () => 'the-token';

    http.get('/assets/i18n/en.json').subscribe();

    const req = httpMock.expectOne('/assets/i18n/en.json');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend
npx ng test --include=src/app/core/auth/auth.interceptor.spec.ts
```

Expected: `FAIL` — `auth.interceptor.ts` doesn't exist yet (module resolution error).

- [ ] **Step 3: Add `AuthService.getAccessToken()`**

In `frontend/src/app/core/auth/auth.service.ts`, add a public method (leave everything else in the file unchanged):

```typescript
  getAccessToken(): string | null {
    return this.oauthService.getAccessToken() || null;
  }
```

Place it directly after the `logout()` method, before `private onOAuthEvent`.

- [ ] **Step 4: Write `auth.interceptor.ts`**

Create `frontend/src/app/core/auth/auth.interceptor.ts`:

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) {
    return next(req);
  }

  const token = inject(AuthService).getAccessToken();
  if (!token) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx ng test --include=src/app/core/auth/auth.interceptor.spec.ts
```

Expected: `PASS` (all 3 tests).

- [ ] **Step 6: Register the interceptor in `app.config.ts`**

In `frontend/src/app/app.config.ts`, change the import and the `provideHttpClient()` call:

```typescript
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { provideAuth } from './core/auth/auth.providers';
import { detectLanguage } from './core/i18n/language-detection';
import { TranslocoHttpLoader } from './core/i18n/transloco-http.loader';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    provideTransloco({
      config: {
        availableLangs: ['ca', 'es', 'en'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(() => {
      const translocoService = inject(TranslocoService);
      const lang = detectLanguage(navigator.language);
      translocoService.setActiveLang(lang);
      return firstValueFrom(translocoService.load(lang));
    }),
    ...provideAuth(),
  ]
};
```

- [ ] **Step 7: Run the full frontend test suite**

```bash
npm test
```

Expected: `PASS` — no regressions in `upload.service.spec.ts`, `auth.service.spec.ts`, `auth.guard.spec.ts`, or any component spec (the interceptor is additive and only touches `/api/*` requests, which every existing spec already mocks via `HttpTestingController` and will now just also see the extra header when a fake token is set, which none of them set).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/core/auth/auth.service.ts frontend/src/app/core/auth/auth.interceptor.ts frontend/src/app/core/auth/auth.interceptor.spec.ts frontend/src/app/app.config.ts
git commit -m "feat(frontend): attach bearer token to /api/ requests via HTTP interceptor"
```

---

## Task 6: nginx config and frontend `Dockerfile`

**Files:**
- Create: `nginx/default.conf`
- Modify: `frontend/Dockerfile`

**Interfaces:**
- Produces: an nginx container listening on `80`, serving `/usr/share/nginx/html`, proxying `/api/*` to `http://backend:8000` and `/api/health` to `http://backend:8000/health` (the backend's actual health path has no `/api` prefix — see Step 1's note), with an `index.html` SPA fallback for the Angular router.
- Consumes: `backend` as a Docker Compose service name resolvable on the internal network (wired in Task 7).

- [ ] **Step 1: Write `nginx/default.conf`**

Create `nginx/default.conf` at the **repository root** (not inside `frontend/`):

```nginx
server {
    listen 80;

    # The backend's health endpoint lives at /health (no /api prefix —
    # see backend/app/main.py). This dedicated location lets the deploy
    # workflow's smoke test hit /api/health through the same public
    # proxy as everything else, without adding an /api-prefixed route
    # to the backend just for this.
    location = /api/health {
        proxy_pass http://backend:8000/health;
        proxy_set_header Host $host;
    }

    location /api/ {
        proxy_pass http://backend:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Replace the stub frontend Dockerfile**

Replace `frontend/Dockerfile`. Note the build context for this Dockerfile is the **repository root** (wired in Task 7's `docker-compose.yml`), so paths are relative to the repo root, not to `frontend/`:

```dockerfile
# syntax=docker/dockerfile:1.7
# ---- Build stage ----
FROM node:20-slim AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/. .
RUN npm run build -- --configuration=production

# ---- Runtime stage ----
FROM nginx:alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 3: Build the image to verify it works, from the repo root**

```bash
cd /Users/albertoreal/Documents/FNX/develop/plan-count
docker build -f frontend/Dockerfile -t plan-count-frontend-test .
```

Expected: build succeeds — both the Angular build and the nginx copy step.

- [ ] **Step 4: Smoke-test the built image alone (nginx will log upstream errors for `/api/`, which is expected since no `backend` container is running yet)**

```bash
docker run --rm -d -p 18091:80 --name plan-count-frontend-test plan-count-frontend-test
sleep 2
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:18091/
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:18091/app
docker stop plan-count-frontend-test
```

Expected: both requests return `200` (the second one via the `try_files ... /index.html` SPA fallback, proving the deep-link fix from spec §3.2 works).

- [ ] **Step 5: Commit**

```bash
git add nginx/default.conf frontend/Dockerfile
git commit -m "feat(infra): real nginx config and multi-stage frontend Dockerfile"
```

---

## Task 7: `docker-compose.yml`

**Files:**
- Create: `docker-compose.yml` (repository root)
- Create: `.env.prod.example` (repository root)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `backend/Dockerfile` (Task 4), `frontend/Dockerfile` + `nginx/default.conf` (Task 6).
- Produces: two services, `backend` and `frontend`, on one `internal` bridge network; `frontend` published at `127.0.0.1:8091:80` on the host.

- [ ] **Step 1: Write `docker-compose.yml`**

Create `docker-compose.yml` at the repository root:

```yaml
name: plan-count

services:
  backend:
    build:
      context: ./backend
    restart: unless-stopped
    environment:
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:?OPENROUTER_API_KEY is required}
      CORS_ALLOWED_ORIGIN: ${CORS_ALLOWED_ORIGIN:?CORS_ALLOWED_ORIGIN is required}
    networks:
      - internal

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      # Only accessible via localhost on the VM; the Cloudflare Tunnel
      # (cloudflared systemd, in albertoreal-infra) exposes it as
      # plan-count.albertoreal.com — same pattern as pokemon-game (8090)
      # and Keycloak (8081) on this VM.
      - "127.0.0.1:8091:80"
    networks:
      - internal

networks:
  internal:
    driver: bridge
```

- [ ] **Step 2: Write `.env.prod.example`**

Create `.env.prod.example` at the repository root (documents the two required vars without committing real secrets):

```
OPENROUTER_API_KEY=
CORS_ALLOWED_ORIGIN=https://plan-count.albertoreal.com
```

- [ ] **Step 3: Ensure the real `.env.prod` is gitignored**

Check `.gitignore` for an existing `.env*` or `.env.prod` rule; if none exists, append:

```
.env.prod
```

- [ ] **Step 4: Validate the compose file**

```bash
cd /Users/albertoreal/Documents/FNX/develop/plan-count
OPENROUTER_API_KEY=dummy CORS_ALLOWED_ORIGIN=http://localhost:4200 docker compose config --quiet
```

Expected: no output, exit code `0` (a syntax/schema error would print to stderr and exit non-zero).

- [ ] **Step 5: Bring the full stack up locally and verify end-to-end**

```bash
OPENROUTER_API_KEY=dummy CORS_ALLOWED_ORIGIN=http://localhost:4200 docker compose up -d --build
sleep 3
curl -sS http://localhost:8091/api/health
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:8091/app
docker compose down
```

Expected: `curl http://localhost:8091/api/health` prints `{"status":"ok"}` (proving the nginx `/api/health` special-case from Task 6 correctly reaches the backend's `/health`), and `/app` returns `200`.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.prod.example .gitignore
git commit -m "feat(infra): add production docker-compose stack"
```

---

## Task 8: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: repository or organization secrets `VM_SSH_PRIVATE_KEY`, `VM_HOST`, `VM_USER` (created manually in GitHub settings — not part of this task; reused if they already exist as organization secrets, since `pokemon-game` already defines this exact secret set).

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/deploy.yml`, mirroring `pokemon-game`'s `.github/workflows/deploy.yml`:

```yaml
name: Deploy to OCI VM

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-prod
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.VM_SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H "${{ secrets.VM_HOST }}" >> ~/.ssh/known_hosts 2>/dev/null

      - name: Deploy
        env:
          HOST: ${{ secrets.VM_HOST }}
          USER: ${{ secrets.VM_USER }}
        run: |
          ssh -i ~/.ssh/deploy_key "$USER@$HOST" bash -s <<'EOF'
          set -euo pipefail
          cd /home/ubuntu/plan-count
          echo "=== git pull ==="
          git fetch --prune origin
          git reset --hard origin/main
          echo "=== docker compose build + up ==="
          docker compose --env-file .env.prod up -d --build
          echo "=== prune old images ==="
          docker image prune -f
          echo "=== final state ==="
          docker compose --env-file .env.prod ps
          EOF

      - name: Smoke test
        run: |
          sleep 15
          for i in 1 2 3 4 5 6; do
            code=$(curl -sSo /dev/null -w "%{http_code}" --max-time 15 "https://plan-count.albertoreal.com/api/health" || echo "000")
            if [ "$code" = "200" ]; then
              echo "health check OK (attempt $i)"
              exit 0
            fi
            echo "attempt $i: code=$code, retrying..."
            sleep 10
          done
          echo "❌ health check did not return 200 after 6 attempts"
          exit 1
```

- [ ] **Step 2: Validate the workflow's YAML syntax**

```bash
cd /Users/albertoreal/Documents/FNX/develop/plan-count
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo "valid YAML"
```

Expected: prints `valid YAML`. (If `PyYAML` isn't available, `pip install pyyaml` first, or skip this check and rely on GitHub's own validation on first push — either is acceptable, this step is a fast local sanity check, not a hard gate.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat(infra): add GitHub Actions deploy workflow"
```

---

## Task 9: `albertoreal-infra` — Cloudflare Tunnel ingress entry

**Files (in the sibling `albertoreal-infra` repo at `/Users/albertoreal/Documents/FNX/develop/albertoreal-infra`, not in `plan-count`):**
- Modify: `cloudflared/config.yml`

This task lives in a different repository with its own git history — commit it there, separately from `plan-count`.

- [ ] **Step 1: Add the ingress entry**

In `/Users/albertoreal/Documents/FNX/develop/albertoreal-infra/cloudflared/config.yml`, insert a new entry before the catch-all `- service: http_status:404` line (keep every existing entry unchanged):

```yaml
tunnel: 743628cf-44a7-4a6d-b67b-c0cfea8708f4
credentials-file: /etc/cloudflared/743628cf-44a7-4a6d-b67b-c0cfea8708f4.json

ingress:
  - hostname: albertoreal.com
    service: http://localhost:8080
  - hostname: www.albertoreal.com
    service: http://localhost:8080
  - hostname: auth.albertoreal.com
    service: http://localhost:8081
  - hostname: pokemon.albertoreal.com
    service: http://localhost:8090
  - hostname: plan-count.albertoreal.com
    service: http://localhost:8091
  - hostname: ds.albertoreal.com
    service: http://localhost:9090
  - hostname: ds-dev.albertoreal.com
    service: http://localhost:9091
  - hostname: dockge.albertoreal.com
    service: http://localhost:9092
  - hostname: dev.albertoreal.com
    service: http://localhost:9093
  - service: http_status:404
```

- [ ] **Step 2: Validate the YAML**

```bash
cd /Users/albertoreal/Documents/FNX/develop/albertoreal-infra
python3 -c "import yaml, sys; yaml.safe_load(open('cloudflared/config.yml'))" && echo "valid YAML"
```

Expected: prints `valid YAML`.

- [ ] **Step 3: Commit (in `albertoreal-infra`, not `plan-count`)**

```bash
git add cloudflared/config.yml
git commit -m "feat: add Cloudflare Tunnel ingress for plan-count.albertoreal.com"
```

- [ ] **Step 4: Note the remaining manual, non-code follow-ups (do not attempt to automate these — they require live credentials/VM access and are explicitly out of this plan's scope per the spec)**

1. On the VM, once the updated `cloudflared/config.yml` is deployed and `cloudflared` has reloaded: run once —
   `cloudflared tunnel route dns 743628cf-44a7-4a6d-b67b-c0cfea8708f4 plan-count.albertoreal.com`
2. Re-export `realm-config/realm-albertoreal.json` in `albertoreal-infra` (per that repo's documented export script) so the already-created `plan-count-frontend` Keycloak client is captured in the versioned realm backup.
3. One-time VM setup before the first automated deploy: `git clone` the `plan-count` repo to `/home/ubuntu/plan-count`, then create `.env.prod` there from `.env.prod.example` with the real `OPENROUTER_API_KEY` and `CORS_ALLOWED_ORIGIN=https://plan-count.albertoreal.com`.
4. Ensure `VM_SSH_PRIVATE_KEY`, `VM_HOST`, `VM_USER` secrets exist for the `plan-count` GitHub repo (reused as organization secrets if `pokemon-game` already defines them there; otherwise added as repository secrets on `plan-count`).

---

## Post-plan note: the spec file itself is currently gitignored

`docs/` is listed in this repo's root `.gitignore` (`.gitignore:4`), so `docs/superpowers/specs/2026-09-01-infra-deploy-design.md` and this plan file are **untracked** — `git status` won't show them and a plain `git add .` won't pick them up, even though the three earlier spec/plan pairs *are* tracked (they were force-added at some point). Use `git add -f docs/superpowers/specs/2026-09-01-infra-deploy-design.md docs/superpowers/plans/2026-09-01-infra-deploy.md` when you're ready to commit these two files, to keep them alongside the rest of the project's design history.
