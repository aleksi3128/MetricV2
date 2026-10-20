"""Sceller et ouvrir une donnée sensible (`docs/dossier-medical.md`, D1–D2).

AES-256-GCM : chaque enveloppe porte son nonce de 12 octets, et l'authentification refuse
une enveloppe altérée au lieu de rendre du bruit. Une seule implémentation — le dossier
médical s'en sert aujourd'hui ; ce qui demandera demain le même coffre passera par ici.

**Rien de ce qui est scellé ne se journalise.** Une erreur dit qu'une enveloppe ne s'ouvre
pas, jamais ce qu'elle contenait.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.exceptions import MedicalKeyError, MedicalNotConfiguredError

NONCE_BYTES = 12


def new_key() -> str:
    return base64.urlsafe_b64encode(AESGCM.generate_key(bit_length=256)).decode("ascii")


class Sealer:
    def __init__(self, key: str) -> None:
        if not key.strip():
            raise MedicalNotConfiguredError
        try:
            raw = base64.urlsafe_b64decode(key.strip() + "=" * (-len(key.strip()) % 4))
        except (binascii.Error, ValueError) as error:
            raise MedicalNotConfiguredError from error
        if len(raw) != 32:
            raise MedicalNotConfiguredError
        self._aead = AESGCM(raw)

    def seal(self, value: dict[str, Any]) -> str:
        nonce = os.urandom(NONCE_BYTES)
        sealed = self._aead.encrypt(nonce, json.dumps(value, ensure_ascii=False).encode(), None)
        return base64.urlsafe_b64encode(nonce + sealed).decode("ascii")

    def open(self, envelope: str) -> dict[str, Any]:
        try:
            raw = base64.urlsafe_b64decode(envelope.encode("ascii"))
            plain = self._aead.decrypt(raw[:NONCE_BYTES], raw[NONCE_BYTES:], None)
            value = json.loads(plain)
        except (InvalidTag, ValueError, binascii.Error, UnicodeDecodeError) as error:
            raise MedicalKeyError from error
        if not isinstance(value, dict):
            raise MedicalKeyError
        return value
