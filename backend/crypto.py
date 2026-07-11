"""Fernet encryption for secrets that must live at rest locally (the iCloud
app-specific password). Key comes from ENCRYPTION_KEY in .env — never store
these secrets in plaintext, never sync them off-device."""
from cryptography.fernet import Fernet, InvalidToken

from config import get_settings


def generate_key() -> str:
    """One-time helper: python -c "from crypto import generate_key; print(generate_key())" """
    return Fernet.generate_key().decode()


def _fernet() -> Fernet:
    key = get_settings().encryption_key
    if not key:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set in .env — generate one with "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Could not decrypt secret — ENCRYPTION_KEY changed?") from exc
