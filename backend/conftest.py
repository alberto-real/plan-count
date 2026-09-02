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
