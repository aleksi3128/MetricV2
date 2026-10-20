"""La passkey (WebAuthn) : l'ajouter une fois connecté, puis s'en servir pour entrer
(`docs/exploitation-securite.md`, D1–D3).

La vérification cryptographique est celle de `webauthn` (Duo Labs) — comme pour Web Push,
une erreur d'implémentation ici ne produirait pas un bogue visible mais une porte plus
faible qu'annoncé. Ce module ne fait que tenir le trousseau et les défis.

**Un défi ne sert qu'une fois, et cinq minutes.** Il vit en mémoire du processus : l'API
tourne en un seul processus, et un défi perdu au redémarrage se redemande d'un appui.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any

from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.exceptions import InvalidAuthenticationResponse, InvalidRegistrationResponse
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.config import Settings
from app.core.dates import now_local
from app.core.exceptions import PasskeyNotConfiguredError, PasskeyRefusedError
from app.domains.passkey.keyring import Key, Keyring
from app.storage.errors import StorageConflictError, StorageNotFoundError

CHALLENGE_TTL_S = 300.0


class Challenges:
    def __init__(self) -> None:
        self._items: dict[str, tuple[bytes, float]] = {}

    def keep(self, purpose: str, challenge: bytes) -> None:
        self._items[purpose] = (challenge, time.monotonic() + CHALLENGE_TTL_S)

    def take(self, purpose: str) -> bytes:
        item = self._items.pop(purpose, None)
        if item is None or item[1] < time.monotonic():
            raise PasskeyRefusedError("Le défi a expiré : recommence.")
        return item[0]


#: Un seul processus, un seul utilisateur : un seul jeu de défis.
CHALLENGES = Challenges()


def _options(options: Any) -> dict[str, Any]:
    return dict(json.loads(options_to_json(options)))


class PasskeyService:
    def __init__(self, settings: Settings, challenges: Challenges = CHALLENGES) -> None:
        self._settings = settings
        self._keyring = Keyring(settings.passkey_dir)
        self._challenges = challenges

    def _check(self) -> None:
        if not self._settings.passkey_configured:
            raise PasskeyNotConfiguredError

    def keys(self) -> list[Key]:
        return self._keyring.all()

    def _descriptors(self) -> list[PublicKeyCredentialDescriptor]:
        return [PublicKeyCredentialDescriptor(id=base64url_to_bytes(key.id)) for key in self.keys()]

    # ── Ajouter ───────────────────────────────────────

    def register_options(self) -> dict[str, Any]:
        self._check()
        username = self._settings.auth_username
        options = generate_registration_options(
            rp_id=self._settings.passkey_rp_id,
            rp_name="Metric",
            user_name=username,
            user_id=hashlib.sha256(username.encode()).digest()[:16],
            # Découvrable : l'écran de connexion n'a pas à demander l'identifiant.
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
            exclude_credentials=self._descriptors(),
        )
        self._challenges.keep("register", options.challenge)
        return _options(options)

    def register(self, credential: dict[str, Any], name: str) -> list[Key]:
        self._check()
        challenge = self._challenges.take("register")
        try:
            verified = verify_registration_response(
                credential=credential,
                expected_challenge=challenge,
                expected_rp_id=self._settings.passkey_rp_id,
                expected_origin=self._settings.passkey_origin,
            )
        except InvalidRegistrationResponse as error:
            raise PasskeyRefusedError(f"Passkey refusée : {error}") from error
        keys = self.keys()
        keys.append(
            Key(
                id=bytes_to_base64url(verified.credential_id),
                public_key=bytes_to_base64url(verified.credential_public_key),
                sign_count=verified.sign_count,
                name=name.strip() or "Passkey",
                created=now_local().isoformat(timespec="minutes"),
            )
        )
        self._keyring.save(keys)
        return keys

    def delete(self, key_id: str, token: str | None) -> list[Key]:
        if not token:
            raise StorageConflictError(
                "Recharge la liste avant de retirer une passkey.", detail="en-tête If-Match absent"
            )
        keys = self.keys()
        target = next((key for key in keys if key.id == key_id), None)
        if target is None:
            raise StorageNotFoundError("Cette passkey n'existe plus.")
        if target.token != token.strip('"'):
            raise StorageConflictError("Cette passkey a changé : recharge la liste.")
        remaining = [key for key in keys if key.id != key_id]
        self._keyring.save(remaining)
        return remaining

    # ── Entrer ────────────────────────────────────────

    def available(self) -> bool:
        return self._settings.passkey_configured and bool(self.keys())

    def login_options(self) -> dict[str, Any]:
        self._check()
        if not self.keys():
            raise PasskeyRefusedError("Aucune passkey enregistrée : connecte-toi par mot de passe.")
        options = generate_authentication_options(
            rp_id=self._settings.passkey_rp_id,
            allow_credentials=self._descriptors(),
            user_verification=UserVerificationRequirement.PREFERRED,
        )
        self._challenges.keep("login", options.challenge)
        return _options(options)

    def login(self, credential: dict[str, Any]) -> str:
        """Vérifie la passkey et rend l'identifiant à qui ouvrir une session."""
        self._check()
        challenge = self._challenges.take("login")
        keys = self.keys()
        key = next((item for item in keys if item.id == credential.get("id")), None)
        if key is None:
            raise PasskeyRefusedError
        try:
            verified = verify_authentication_response(
                credential=credential,
                expected_challenge=challenge,
                expected_rp_id=self._settings.passkey_rp_id,
                expected_origin=self._settings.passkey_origin,
                credential_public_key=base64url_to_bytes(key.public_key),
                credential_current_sign_count=key.sign_count,
            )
        except InvalidAuthenticationResponse as error:
            raise PasskeyRefusedError from error
        self._keyring.save(
            [
                Key(
                    id=item.id,
                    public_key=item.public_key,
                    sign_count=verified.new_sign_count if item.id == key.id else item.sign_count,
                    name=item.name,
                    created=item.created,
                )
                for item in keys
            ]
        )
        return self._settings.auth_username
