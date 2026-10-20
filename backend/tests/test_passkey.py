"""La passkey (`docs/exploitation-securite.md`, D1–D3).

Ajoutée une fois connecté, elle ouvre ensuite une session sans mot de passe — et le mot de
passe reste. Sans configuration, elle est fermée et le dit. Une origine qui ne colle pas
est refusée, et la retirer passe par `If-Match` comme toute suppression.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from tests.fake_authenticator import FakeAuthenticator

ORIGIN = "https://metric.exemple.fr"


@pytest.fixture
def keyed(settings: Settings, tmp_path: Path) -> Settings:
    settings.passkey_rp_id = "metric.exemple.fr"
    settings.passkey_origin = ORIGIN
    settings.passkey_dir = str(tmp_path / "passkeys")
    return settings


def enrol(client: TestClient, auth: dict[str, str], device: FakeAuthenticator) -> dict[str, Any]:
    options = client.post("/api/passkey/register/options", headers=auth).json()
    response = client.post(
        "/api/passkey/register",
        json={"credential": device.create(options), "name": "iPhone"},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    return dict(response.json())


def test_closed_without_configuration_and_the_password_still_works(
    client: TestClient, auth: dict[str, str]
) -> None:
    response = client.post("/api/passkey/register/options", headers=auth)
    assert response.status_code == 503
    assert response.json()["code"] == "passkey_not_configured"
    assert client.get("/api/auth/passkey").json() == {"available": False}


def test_added_once_signed_in_then_it_opens_a_session_alone(
    client: TestClient, auth: dict[str, str], keyed: Settings
) -> None:
    device = FakeAuthenticator(ORIGIN)
    listed = enrol(client, auth, device)
    assert [item["name"] for item in listed["items"]] == ["iPhone"]
    assert client.get("/api/auth/passkey").json() == {"available": True}

    options = client.post("/api/auth/passkey/options").json()
    session = client.post("/api/auth/passkey", json={"credential": device.get(options)})
    assert session.status_code == 200, session.text
    token = session.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["username"] == keyed.auth_username


def test_a_foreign_origin_and_a_replayed_challenge_are_refused(
    client: TestClient, auth: dict[str, str], keyed: Settings
) -> None:
    device = FakeAuthenticator(ORIGIN)
    enrol(client, auth, device)

    options = client.post("/api/auth/passkey/options").json()
    impostor = FakeAuthenticator("https://hameconnage.example")
    impostor.key, impostor.credential_id = device.key, device.credential_id
    refused = client.post("/api/auth/passkey", json={"credential": impostor.get(options)})
    assert refused.status_code == 401
    assert refused.json()["code"] == "passkey_refused"

    # Le défi a servi : le rejouer, même bien signé, ne rouvre rien.
    replay = client.post("/api/auth/passkey", json={"credential": device.get(options)})
    assert replay.status_code == 401


def test_removing_a_passkey_needs_its_token(
    client: TestClient, auth: dict[str, str], keyed: Settings
) -> None:
    item = enrol(client, auth, FakeAuthenticator(ORIGIN))["items"][0]
    assert client.delete(f"/api/passkey/{item['id']}", headers=auth).status_code == 409
    gone = client.delete(f"/api/passkey/{item['id']}", headers={**auth, "If-Match": item["token"]})
    assert gone.json()["items"] == []
    assert client.get("/api/auth/passkey").json() == {"available": False}
