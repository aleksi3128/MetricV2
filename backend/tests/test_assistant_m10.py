"""Ce que l'assistant note de plus depuis M-10 (`docs/pages/modifications.md`).

Quatre gestes qu'on dit plutôt qu'on ne les tape : un repas d'hier, une douleur, une
natation dans la notation, un effort perçu sur une séance du jour. Chacun est vérifié
**dans le CSV** — comme `test_assistant_actions.py`, dont ce fichier reprend les aides —,
et chacun avec ce qui le refuse : c'est le serveur qui dit non, jamais la seule consigne.
"""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.core.dates import today_local
from tests.fake_openrouter import FakeOpenRouter
from tests.fake_webdav import FakeWebDav

ASSISTANT = "/api/assistant"
TODAY = today_local()
YESTERDAY = TODAY - timedelta(days=1)


def answer(**fields: Any) -> str:
    base: dict[str, Any] = {"reply": "C'est noté.", "remember": [], "actions": []}
    return json.dumps({**base, **fields})


def acted(
    client: TestClient, auth: dict[str, str], question: str = "Note-le."
) -> list[dict[str, Any]]:
    response = client.post(f"{ASSISTANT}/chat", json={"question": question}, headers=auth)
    assert response.status_code == 200, response.text
    reports: list[dict[str, Any]] = response.json()["actions"]
    return reports


def say(openrouter: FakeOpenRouter, name: str, **args: Any) -> None:
    openrouter.say(answer(actions=[{"name": name, "args": args}]))


# ── meal.add pour hier ────────────────────────────────


def test_a_meal_is_noted_for_yesterday_at_its_usual_hour(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    """Le reste de M-01 : l'assistant rattrape un repas d'hier comme la feuille le fait."""
    say(openrouter, "meal.add", meal_type="dîner", comment="Pâtes au thon", day="yesterday")

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "done", report
    assert "journal d'hier" in report["summary"]
    assert "journal du jour" not in report["summary"]
    view = ai_app_client.get("/api/nutrition?day=yesterday", headers=auth).json()
    meal = view["meals"][0]
    assert meal["datetime"].startswith(YESTERDAY.isoformat())
    # L'heure est celle du type, et elle se dit non relevée : jamais inventée.
    assert meal["datetime"][11:16] == "20:00"
    assert meal["time_recorded"] is False
    assert meal["source"] == "ia"


def test_a_meal_without_day_stays_today(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    say(openrouter, "meal.add", meal_type="déjeuner", comment="Salade")

    report = acted(ai_app_client, auth)[0]

    assert "journal du jour" in report["summary"]
    view = ai_app_client.get("/api/nutrition", headers=auth).json()
    assert view["meals"][0]["time_recorded"] is True


def test_yesterday_needs_one_of_the_four_types(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter, dav: FakeWebDav
) -> None:
    """Le défaut de la 4 b ne revient pas par l'assistant : un libellé libre poserait une
    heure de repli, et un type deviné à l'heure ferait d'un dîner un petit-déjeuner."""
    say(openrouter, "meal.add", meal_type="repas", comment="Pizza", day="yesterday")

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "refused"
    assert "dis lequel" in report["summary"]
    assert "Metric/nutrition/meals.csv" not in dav.files


def test_the_day_before_yesterday_is_refused(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter, dav: FakeWebDav
) -> None:
    say(openrouter, "meal.add", meal_type="dîner", comment="Pizza", day="2020-01-01")

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "refused"
    assert "Metric/nutrition/meals.csv" not in dav.files


def test_the_meal_day_is_described_to_the_model() -> None:
    from app.domains.assistant.actions import catalogue

    described = catalogue()["meal.add"].describe

    assert 'day ("today" | "yesterday", ou null)' in described
    assert "source" not in described
