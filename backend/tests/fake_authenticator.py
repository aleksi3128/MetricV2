"""Un authentificateur WebAuthn en mémoire : une vraie clé P-256, de vraies signatures.

Il ne remplace pas un téléphone — il ne prouve rien de Face ID ni du trousseau iCloud —
mais il fait passer la **vraie** vérification de `webauthn` : un défi rejoué, une origine
qui ne colle pas ou une signature tordue y sont refusés comme ils le seraient en vrai.
"""

from __future__ import annotations

import hashlib
import json
import os
import struct
from typing import Any

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from webauthn.helpers import bytes_to_base64url


class FakeAuthenticator:
    def __init__(self, origin: str) -> None:
        self.origin = origin
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.credential_id = os.urandom(16)
        self.count = 0

    def _client_data(self, kind: str, challenge: str) -> bytes:
        return json.dumps(
            {"type": kind, "challenge": challenge, "origin": self.origin, "crossOrigin": False}
        ).encode()

    def _cose(self) -> bytes:
        numbers = self.key.public_key().public_numbers()
        return cbor2.dumps(
            {
                1: 2,
                3: -7,
                -1: 1,
                -2: numbers.x.to_bytes(32, "big"),
                -3: numbers.y.to_bytes(32, "big"),
            }
        )

    def create(self, options: dict[str, Any]) -> dict[str, Any]:
        rp = hashlib.sha256(options["rp"]["id"].encode()).digest()
        attested = (
            bytes(16)
            + struct.pack(">H", len(self.credential_id))
            + self.credential_id
            + self._cose()
        )
        auth_data = rp + bytes([0x45]) + struct.pack(">I", 0) + attested
        attestation = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        identifier = bytes_to_base64url(self.credential_id)
        return {
            "id": identifier,
            "rawId": identifier,
            "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(
                    self._client_data("webauthn.create", options["challenge"])
                ),
                "attestationObject": bytes_to_base64url(attestation),
            },
            "clientExtensionResults": {},
        }

    def get(self, options: dict[str, Any]) -> dict[str, Any]:
        self.count += 1
        rp = hashlib.sha256(options["rpId"].encode()).digest()
        auth_data = rp + bytes([0x05]) + struct.pack(">I", self.count)
        client_data = self._client_data("webauthn.get", options["challenge"])
        signature = self.key.sign(
            auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256())
        )
        identifier = bytes_to_base64url(self.credential_id)
        return {
            "id": identifier,
            "rawId": identifier,
            "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(client_data),
                "authenticatorData": bytes_to_base64url(auth_data),
                "signature": bytes_to_base64url(signature),
            },
            "clientExtensionResults": {},
        }
