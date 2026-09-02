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
