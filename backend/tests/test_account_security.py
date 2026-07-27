import hashlib
import pytest

from core.security import hash_action_token, hash_password, validate_password, verify_password


def test_action_token_is_stored_as_sha256_digest():
    raw = "raw-secret-token"
    digest = hash_action_token(raw)
    assert digest == hashlib.sha256(raw.encode()).hexdigest()
    assert raw not in digest


def test_new_password_is_bcrypt_hashed():
    encoded = hash_password("a long secure passphrase")
    assert encoded != "a long secure passphrase"
    assert encoded.startswith(("$2a$", "$2b$", "$2y$"))
    assert verify_password("a long secure passphrase", encoded)


@pytest.mark.parametrize("password", ["short", "password123", "x" * 129])
def test_weak_or_abusive_passwords_are_rejected(password):
    with pytest.raises(ValueError):
        validate_password(password)


def test_passphrases_are_allowed():
    validate_password("correct horse battery staple")
