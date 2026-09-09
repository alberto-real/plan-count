from __future__ import annotations

import time

import httpx
import jwt
from fastapi import HTTPException, Request

from app.config import settings

_ISSUER = "https://auth.albertoreal.com/realms/albertoreal"
_JWKS_URL = f"{_ISSUER}/protocol/openid-connect/certs"
_CLIENT_ID = "plan-count-frontend"
_JWKS_CACHE_TTL_SECONDS = 300
_JWKS_MIN_REFETCH_INTERVAL_SECONDS = 30

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
    fetched_at: float = _jwks_cache["fetched_at"]  # type: ignore[assignment]
    age = time.monotonic() - fetched_at
    is_stale = age > _JWKS_CACHE_TTL_SECONDS
    kid_missing_and_worth_retrying = kid not in keys and age > _JWKS_MIN_REFETCH_INTERVAL_SECONDS
    if is_stale or kid_missing_and_worth_retrying:
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

    Skipped entirely (always passes) when `settings.auth_disabled` is set —
    local-dev-only escape hatch so Keycloak isn't required to work on the
    app; must never be true in production.
    """
    if settings.auth_disabled:
        return

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
