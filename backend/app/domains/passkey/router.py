"""Les routes de la passkey : les unes pour entrer (sans jeton), les autres pour gérer ses
clés (avec) — `docs/exploitation-securite.md`, D1–D3."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Header, Path, Request
from pydantic import BaseModel, Field

from app.core.deps import IssuerDep, SettingsDep, ThrottleDep
from app.core.throttle import client_ip
from app.domains.auth import SessionResponse
from app.domains.passkey.keyring import Key
from app.domains.passkey.service import PasskeyService

IfMatch = Annotated[str | None, Header(alias="If-Match")]
KeyId = Annotated[str, Path(min_length=1, max_length=512)]


class PasskeyItem(BaseModel):
    id: str
    name: str
    created: str
    #: « ajoutée le 20/10/2026 », rédigée ici : l'écran ne met aucune date en forme.
    created_text: str
    token: str


class PasskeyList(BaseModel):
    #: Faux sans `PASSKEY_RP_ID` / `PASSKEY_ORIGIN` : l'écran le dit, et n'offre rien.
    configured: bool
    items: list[PasskeyItem]


class Availability(BaseModel):
    #: Configurée **et** au moins une enregistrée : l'écran de connexion n'offre le
    #: bouton que dans ce cas.
    available: bool


class Registration(BaseModel):
    credential: dict[str, Any]
    name: str = Field(default="", max_length=60)


class Assertion(BaseModel):
    credential: dict[str, Any]


def _list(settings: Any, keys: list[Key]) -> PasskeyList:
    return PasskeyList(
        configured=settings.passkey_configured,
        items=[
            PasskeyItem(
                id=key.id,
                name=key.name,
                created=key.created,
                created_text=f"ajoutée le {key.created[8:10]}/{key.created[5:7]}/{key.created[:4]}",
                token=key.token,
            )
            for key in keys
        ],
    )


# ── Gérer ses passkeys : connecté ─────────────────────

router = APIRouter(prefix="/passkey", tags=["passkey"])


@router.get("", response_model=PasskeyList, summary="Les passkeys enregistrées")
def read_passkeys(settings: SettingsDep) -> PasskeyList:
    return _list(settings, PasskeyService(settings).keys())


@router.post("/register/options", summary="Préparer l'ajout d'une passkey")
def register_options(settings: SettingsDep) -> dict[str, Any]:
    return PasskeyService(settings).register_options()


@router.post("/register", response_model=PasskeyList, summary="Ajouter une passkey")
def register(payload: Registration, settings: SettingsDep) -> PasskeyList:
    return _list(settings, PasskeyService(settings).register(payload.credential, payload.name))


@router.delete("/{key_id}", response_model=PasskeyList, summary="Retirer une passkey")
def delete(key_id: KeyId, settings: SettingsDep, if_match: IfMatch = None) -> PasskeyList:
    return _list(settings, PasskeyService(settings).delete(key_id, if_match))


# ── Entrer : sans jeton ───────────────────────────────

public_router = APIRouter(prefix="/auth/passkey", tags=["passkey"])


@public_router.get("", response_model=Availability, summary="La passkey est-elle offerte ?")
def availability(settings: SettingsDep) -> Availability:
    return Availability(available=PasskeyService(settings).available())


@public_router.post("/options", summary="Préparer une connexion par passkey")
def login_options(settings: SettingsDep) -> dict[str, Any]:
    return PasskeyService(settings).login_options()


@public_router.post("", response_model=SessionResponse, summary="Entrer avec une passkey")
def login(
    payload: Assertion,
    request: Request,
    settings: SettingsDep,
    issuer: IssuerDep,
    throttle: ThrottleDep,
) -> SessionResponse:
    """Le même frein que le mot de passe (`AUTH-04`) : consulté avant de vérifier."""
    caller = client_ip(request, trust_proxy=settings.trust_proxy_headers)
    throttle.guard(caller)
    try:
        username = PasskeyService(settings).login(payload.credential)
    except Exception:
        throttle.record_failure(caller)
        raise
    throttle.clear(caller)
    session = issuer.issue(username)
    return SessionResponse(
        access_token=session.access_token,
        expires_at=session.expires_at,
        username=session.username,
    )
