"""Les refus de validation, en français sous le bon champ (audit du 17 octobre, fiche 11).

Pydantic écrit en anglais, et `handle_validation_error` recopiait son texte : « Input should
be greater than 0 » s'affichait sous le champ du poids. Le client affiche le message tel
quel (CLAUDE.md §2) ; c'est donc au serveur de le dire en français.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.dates import today_local
from app.core.validation_fr import translate
from app.storage.files import FileStore
from app.storage.provider import StorageProvider


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def refused(
    client: TestClient, auth: dict[str, str], path: str, body: dict[str, Any]
) -> dict[str, str]:
    response = client.post(path, json=body, headers=auth)
    assert response.status_code == 422, response.text
    return {entry["field"]: entry["message"] for entry in response.json()["fields"]}


def test_a_weight_refusal_reads_in_french(app_client: TestClient, auth: dict[str, str]) -> None:
    yesterday = (today_local() - timedelta(days=1)).isoformat()

    assert refused(
        app_client, auth, "/api/body/weight", {"date": yesterday, "weight_kg": "abc"}
    ) == {"body.weight_kg": "Un nombre est attendu."}
    assert refused(app_client, auth, "/api/body/weight", {"date": yesterday}) == {
        "body.weight_kg": "Champ obligatoire."
    }


def test_no_message_is_ever_english(app_client: TestClient, auth: dict[str, str]) -> None:
    fields = refused(
        app_client,
        auth,
        "/api/supplements/schedule",
        {"name": "", "dose": -5, "unit": "g", "time": "25:00", "frequency": "1 jour sur 2"},
    )

    for message in fields.values():
        assert "Input should" not in message
        assert "Value error" not in message
        assert "should" not in message.lower()
    # Notre propre validateur parlait déjà français : seul le préfixe est retiré.
    assert fields["body.frequency"] == "cadence inconnue : « 1 jour sur 2 »"


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        ({"type": "greater_than", "ctx": {"gt": 0}}, "Doit être supérieur à 0."),
        ({"type": "greater_than_equal", "ctx": {"ge": 0}}, "Doit valoir au moins 0."),
        ({"type": "less_than_equal", "ctx": {"le": 10000}}, "Doit valoir au plus 10 000."),
        ({"type": "less_than", "ctx": {"lt": 2.5}}, "Doit être inférieur à 2,5."),
        ({"type": "string_too_short", "ctx": {"min_length": 1}}, "Ne peut pas être vide."),
        ({"type": "string_too_long", "ctx": {"max_length": 60}}, "Au plus 60 caractères."),
        (
            {"type": "literal_error", "ctx": {"expected": "'run' or 'workout'"}},
            "Valeur non reconnue — attendu : run, workout.",
        ),
        ({"type": "un_type_inconnu"}, "Valeur invalide."),
        ({"type": "value_error", "msg": "Value error, déjà en français"}, "déjà en français"),
    ],
)
def test_each_refusal_type_has_its_sentence(error: dict[str, Any], expected: str) -> None:
    assert translate(error) == expected
