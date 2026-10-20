"""La douleur dite à voix haute (`docs/voix.md`, D7).

Le modèle est simulé : on lui fait rendre ce qu'un modèle pourrait rendre, y compris ce
qu'il ne devrait pas — des valeurs hors bornes, un nom de pathologie. Le serveur relit.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.domains.assistant.conversation import INSTRUCTION
from app.domains.pain import dictation
from tests.fake_openrouter import FakeOpenRouter


def test_a_clean_reading_becomes_a_proposal_with_its_sentence() -> None:
    proposal = dictation.read(
        {
            "zone": "tendon d'Achille",
            "side": "right",
            "intensity": 4,
            "baseline": 1,
            "moment": "after",
            "kind": "pulling",
            "limp": False,
        }
    )
    assert proposal.summary == (
        "J'ai compris : tendon d'Achille droit, 4/10, base 1/10, après, en tiraillement."
    )


def test_out_of_bounds_and_unknown_values_stay_empty() -> None:
    proposal = dictation.read(
        {
            "zone": "  ",
            "side": "gauche",
            "intensity": 14,
            "baseline": True,
            "moment": "soir",
            "kind": "x",
        }
    )
    assert (proposal.zone, proposal.side, proposal.intensity, proposal.baseline) == (
        None,
        None,
        None,
        None,
    )
    assert proposal.moment is None and proposal.kind is None
    assert proposal.summary.startswith("Je n'ai rien pu ranger")


def test_a_diagnosis_is_never_written_as_a_zone() -> None:
    assert dictation.read({"zone": "tendinite d'Achille", "intensity": 3}).zone is None


def test_the_route_returns_a_proposal_and_writes_nothing(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    openrouter.say(json.dumps({"zone": "genou", "side": "left", "intensity": 7, "kind": "sharp"}))
    response = ai_app_client.post(
        "/api/pain/parse",
        json={"text": "J'ai eu une douleur vive au genou gauche, 7 sur 10"},
        headers=auth,
    )

    assert response.status_code == 200, response.text
    assert response.json()["summary"] == "J'ai compris : genou gauche, 7/10, vive."
    assert ai_app_client.get("/api/pain", headers=auth).json()["open"] == []


def test_without_a_key_the_route_says_so(store_client: TestClient, auth: dict[str, str]) -> None:
    response = store_client.post("/api/pain/parse", json={"text": "mal au genou"}, headers=auth)
    assert response.status_code == 503
    assert response.json()["code"] == "ai_unavailable"


def test_the_coach_says_it_straight_and_names_its_principle() -> None:
    assert "tu le dis cash, sans dramatiser" in INSTRUCTION
    assert "nomme le principe" in INSTRUCTION
