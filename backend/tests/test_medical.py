"""Le dossier médical, chiffré (`docs/dossier-medical.md`).

Ce qui compte d'abord : **rien en clair sur le stockage**, et rien d'écrit sans clé. Puis
la garde `If-Match`, la proposition dictée, et ce que le coach a le droit d'en lire.
"""

from __future__ import annotations

import asyncio
import json
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.core.crypto import Sealer, new_key
from app.core.exceptions import MedicalKeyError, MedicalNotConfiguredError
from app.core.validation import today_local
from app.domains.medical import dictation
from app.domains.medical.schemas import MedicalPayload
from app.domains.medical.service import MedicalService
from app.storage.files import FileStore
from tests.fake_openrouter import FakeOpenRouter
from tests.fake_webdav import FakeWebDav

FILE = "Metric/medical/entries.csv"
KEY = new_key()


@pytest.fixture
def keyed(settings: Settings) -> Settings:
    settings.medical_key = KEY
    return settings


def entry(**extra: Any) -> dict[str, Any]:
    return {
        "kind": "profil",
        "title": "Pied hyperlaxe, Achilles courts",
        "details": "Bilan podologique du 12/06 : semelles sur mesure.",
        "practitioner": "Dr Martin, podologue",
        **extra,
    }


# ── Le scellement ─────────────────────────────────────


def test_a_sealed_entry_opens_with_its_key_only() -> None:
    sealed = Sealer(KEY).seal({"title": "Semelles"})
    assert Sealer(KEY).open(sealed) == {"title": "Semelles"}
    with pytest.raises(MedicalKeyError):
        Sealer(new_key()).open(sealed)


def test_a_tampered_envelope_is_refused_not_misread() -> None:
    sealed = Sealer(KEY).seal({"title": "Semelles"})
    flipped = sealed[:-6] + ("A" if sealed[-6] != "A" else "B") + sealed[-5:]
    with pytest.raises(MedicalKeyError):
        Sealer(KEY).open(flipped)


@pytest.mark.parametrize("key", ["", "trop-court", "pas du base64 !!"])
def test_without_a_valid_key_the_dossier_is_closed(key: str) -> None:
    with pytest.raises(MedicalNotConfiguredError):
        Sealer(key)


# ── Par les routes ────────────────────────────────────


def test_nothing_is_written_in_clear(
    store_client: TestClient, auth: dict[str, str], dav: FakeWebDav, keyed: Settings
) -> None:
    response = store_client.post("/api/medical", json=entry(), headers=auth)
    assert response.status_code == 201, response.text
    assert response.json()["entries"][0]["title"] == "Pied hyperlaxe, Achilles courts"

    stored = dav.content_of(FILE)
    for secret in ("hyperlaxe", "podologue", "Martin", "profil", "semelles"):
        assert secret not in stored


def test_without_a_key_nothing_is_read_or_written(
    store_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    response = store_client.post("/api/medical", json=entry(), headers=auth)
    assert response.status_code == 503
    assert response.json()["code"] == "medical_not_configured"
    assert FILE not in dav.files
    assert store_client.get("/api/medical", headers=auth).status_code == 503


def test_an_entry_is_corrected_and_removed_under_if_match(
    store_client: TestClient, auth: dict[str, str], keyed: Settings
) -> None:
    first = store_client.post("/api/medical", json=entry(), headers=auth).json()["entries"][0]

    assert (
        store_client.patch(f"/api/medical/{first['id']}", json=entry(), headers=auth).status_code
        == 409
    )
    corrected = store_client.patch(
        f"/api/medical/{first['id']}",
        json=entry(title="Pied hyperlaxe"),
        headers={**auth, "If-Match": first["token"]},
    ).json()["entries"][0]
    assert corrected["title"] == "Pied hyperlaxe"
    assert corrected["entry_id"] == first["entry_id"]

    gone = store_client.delete(
        f"/api/medical/{corrected['id']}", headers={**auth, "If-Match": corrected["token"]}
    ).json()
    assert gone["entries"] == []


def test_a_dictated_entry_is_a_proposal_and_writes_nothing(
    ai_app_client: TestClient,
    auth: dict[str, str],
    openrouter: FakeOpenRouter,
    keyed: Settings,
    dav: FakeWebDav,
) -> None:
    future = (today_local() + timedelta(days=30)).isoformat()
    openrouter.say(
        json.dumps(
            {
                "kind": "semelles",
                "date": future,
                "title": "Semelles sur mesure",
                "details": "Refaites tous les ans",
                "practitioner": "podologue",
            }
        )
    )
    response = ai_app_client.post(
        "/api/medical/parse", json={"text": "j'ai des semelles sur mesure"}, headers=auth
    )

    assert response.status_code == 200, response.text
    proposal = response.json()
    assert proposal["kind"] == "semelles"
    assert proposal["date"] is None  # une date dans l'avenir n'est pas un événement passé
    assert proposal["summary"] == "J'ai rangé : Semelles · Semelles sur mesure · podologue."
    assert FILE not in dav.files


def test_the_coach_reads_titles_of_four_kinds_and_nothing_else(store: FileStore) -> None:
    service = MedicalService(store, KEY)

    async def fill() -> list[str]:
        await service.create(MedicalPayload(**entry()))
        await service.create(
            MedicalPayload(kind="consultation", title="Kiné, genou", details="IRM normale")
        )
        await service.create(MedicalPayload(kind="traitement", title="Aucun", details="secret"))
        return await service.coach_lines()

    lines = asyncio.run(fill())
    assert lines == ["Profil : Pied hyperlaxe, Achilles courts", "Traitement : Aucun"]
    assert not any("podologue" in line or "IRM" in line or "secret" in line for line in lines)


def test_dictation_never_keeps_an_unknown_kind() -> None:
    assert dictation.read({"kind": "diagnostic", "title": "x"}).kind is None
