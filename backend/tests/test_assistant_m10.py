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


# ── pain.add ──────────────────────────────────────────

KNEE = {
    "intensity": 4,
    "moment": "after",
    "kind": "sharp",
    "zone": "genou",
    "side": "left",
    "baseline": 0,
}


def test_a_pain_is_opened_marked_as_the_assistants_and_undone_like_on_body(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter, dav: FakeWebDav
) -> None:
    """La douleur arrive dans `pain.csv`, avec la réponse graduée du serveur dans le fil,
    et s'annule par la suppression que ferait le glissement de `/corps`."""
    say(openrouter, "pain.add", date=TODAY.isoformat(), **KNEE)

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "done", report
    # La phrase de l'écran, rédigée par les règles et non par le modèle.
    assert report["summary"].startswith(f"Noté le {TODAY:%d/%m}. Douleur (genou, gauche), 4/10")
    assert "Arrêt" in report["summary"]
    assert dav.content_of("Metric/body/pain.csv").strip().endswith(",ia")
    undo = report["undo"]
    assert undo["domain"] == "pain"
    response = ai_app_client.delete(
        f"/api/pain/{undo['row_id']}", headers={**auth, "If-Match": undo["token"]}
    )
    assert response.status_code == 204
    assert ai_app_client.get("/api/pain", headers=auth).json()["open"] == []


def test_a_follow_up_names_the_open_episode(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    opened = ai_app_client.post(
        "/api/pain", json={"date": YESTERDAY.isoformat(), **KNEE}, headers=auth
    ).json()
    say(
        openrouter,
        "pain.add",
        date=TODAY.isoformat(),
        pain_id=opened["pain_id"],
        intensity=2,
        moment="next_day",
        kind="dull",
    )

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "done", report
    assert report["summary"].startswith("Suivi noté le")
    episode = ai_app_client.get("/api/pain", headers=auth).json()["open"][0]
    assert sorted(entry["intensity"] for entry in episode["reports"]) == [2, 4]
    # L'annulation vise le suivi, pas l'ouverture : c'est la dernière ligne écrite.
    assert report["undo"]["row_id"] == 1


def test_the_condensed_view_names_the_open_episode(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    opened = ai_app_client.post(
        "/api/pain", json={"date": TODAY.isoformat(), **KNEE}, headers=auth
    ).json()
    openrouter.say(answer())

    acted(ai_app_client, auth, "Comment va mon genou ?")

    assert f"(pain_id={opened['pain_id']})" in openrouter.calls[0].prompt


def test_a_pain_three_days_old_is_refused_by_the_server(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter, dav: FakeWebDav
) -> None:
    """Rangée après coup, elle changerait l'ordre des relevés — donc la « hausse » qu'a
    déjà lue le coach. La saisie datée reste sur `/corps`."""
    say(openrouter, "pain.add", date=(TODAY - timedelta(days=3)).isoformat(), **KNEE)

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "refused"
    assert "page Corps" in report["summary"]
    assert "Metric/body/pain.csv" not in dav.files


def test_a_diagnosis_is_not_a_zone(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter, dav: FakeWebDav
) -> None:
    """Le filtre de la dictée (MED-06), réemployé : une seule liste pour deux lectures."""
    say(openrouter, "pain.add", date=TODAY.isoformat(), **{**KNEE, "zone": "tendinite rotulienne"})

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "refused"
    assert "Metric/body/pain.csv" not in dav.files


def test_the_model_never_links_a_pain_to_a_run_it_cannot_see() -> None:
    from app.domains.assistant.actions import catalogue, validate

    assert "run_id" not in catalogue()["pain.add"].describe
    checked = validate("pain.add", {"date": TODAY.isoformat(), **KNEE, "run_id": "invente"})
    assert not isinstance(checked, str)
    assert checked[1].model_dump()["run_id"] is None
    assert checked[1].model_dump()["source"] == "manual", "forcée à `ia` à l'écriture seulement"


# ── swim.add ──────────────────────────────────────────

PROGRAM = "400 CR EF\n8×50 CR EA R20\n200 DOS RC"


def test_a_swim_is_read_by_the_server_and_counted_from_its_program(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    """Le modèle écrit la notation ; la distance est le total que le serveur en lit."""
    say(openrouter, "swim.add", date=TODAY.isoformat(), duration_min=40, program=PROGRAM)

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "done", report
    assert "1000 m" in report["summary"]
    swims = ai_app_client.get("/api/activity/swims", headers=auth).json()["swims"]
    assert swims[0]["distance_m"] == 1000
    assert report["undo"]["domain"] == "activity/swims"
    response = ai_app_client.delete(
        f"/api/activity/swims/{report['undo']['row_id']}",
        headers={**auth, "If-Match": report["undo"]["token"]},
    )
    assert response.status_code == 204


def test_a_wrong_notation_goes_back_to_the_model_once(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    """Comme au fil Planning : la faute revient au modèle avec la notation, une fois."""
    say(openrouter, "swim.add", date=TODAY.isoformat(), duration_min=40, program="1500 NL")
    say(openrouter, "swim.add", date=TODAY.isoformat(), duration_min=40, program="1500 CR")

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "done", report
    assert len(openrouter.calls) == 2
    second = openrouter.calls[1].prompt
    assert "À corriger" in second and "NL" in second
    assert "La natation, et sa notation — obligatoire" in second


def test_a_notation_still_wrong_is_refused_with_its_code_and_nothing_written(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter, dav: FakeWebDav
) -> None:
    say(openrouter, "swim.add", date=TODAY.isoformat(), duration_min=40, program="1500 NL")
    say(openrouter, "swim.add", date=TODAY.isoformat(), duration_min=40, program="1500 crawl")

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "refused"
    assert report["code"] == "swim_notation_invalid"
    assert len(openrouter.calls) == 2, "deux appels au plus (`IA-16`)"
    assert "Metric/activity/swims.csv" not in dav.files


def test_no_third_call_when_the_second_pass_is_spent(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    openrouter.say(answer(reply="Je regarde.", need=["notation_natation"]))
    say(openrouter, "swim.add", date=TODAY.isoformat(), duration_min=40, program="1500 NL")

    report = acted(ai_app_client, auth)[0]

    assert report["code"] == "swim_notation_invalid"
    assert len(openrouter.calls) == 2
    # La tranche a bien porté la notation, glossaire compris.
    assert "Sigles admis — nage : CR (crawl)" in openrouter.calls[1].prompt


def test_the_ordinary_thread_offers_the_notation_without_imposing_it(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    openrouter.say(answer())

    acted(ai_app_client, auth, "Bonjour")

    prompt = openrouter.calls[0].prompt
    assert "notation_natation —" in prompt
    assert "swim.add —" in prompt
    assert "rewrite" not in prompt
    assert "Sigles admis" not in prompt


def test_an_argument_refusal_carries_a_code_too(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    say(openrouter, "swim.add", date=TODAY.isoformat(), program=PROGRAM)

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "refused"
    assert report["code"] == "validation_error"


# ── effort.rate ───────────────────────────────────────


def a_run(client: TestClient, auth: dict[str, str], *, day: Any = None) -> dict[str, Any]:
    body = {"date": (day or TODAY).isoformat(), "distance_km": "8", "duration_min": "48:00"}
    response = client.post("/api/activity/runs", json=body, headers=auth)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def rate(openrouter: FakeOpenRouter, kind: str, row: dict[str, Any], rpe: int) -> None:
    say(openrouter, "effort.rate", kind=kind, row_id=row["id"], token=row["token"], rpe=rpe)


def test_an_effort_on_a_session_without_one_runs_and_undoes_to_empty(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    """Une addition sur une séance qui n'en a pas : elle s'exécute, et « Annuler » remet
    l'effort à vide — **jamais** un `DELETE`, qui supprimerait la course."""
    run = a_run(ai_app_client, auth)
    rate(openrouter, "run", run, 7)

    report = acted(ai_app_client, auth, "C'était dur, 7 sur 10.")[0]

    assert report["status"] == "done", report
    assert report["summary"] == "Effort perçu 7/10 noté sur la course (8 km) du jour."
    assert ai_app_client.get(f"/api/activity/runs/{run['id']}", headers=auth).json()["rpe"] == 7
    undo = report["undo"]
    assert (undo["method"], undo["suffix"], undo["body"]) == ("PUT", "rpe", {"rpe": None})

    response = ai_app_client.put(
        f"/api/{undo['domain']}/{undo['row_id']}/{undo['suffix']}",
        json=undo["body"],
        headers={**auth, "If-Match": undo["token"]},
    )

    assert response.status_code == 200, response.text
    after = ai_app_client.get(f"/api/activity/runs/{run['id']}", headers=auth).json()
    assert after["rpe"] is None
    assert after["distance_km"] == 8, "la course est toujours là"


def test_an_effort_already_noted_waits_before_being_overwritten(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    run = a_run(ai_app_client, auth)
    noted = ai_app_client.put(
        f"/api/activity/runs/{run['id']}/rpe",
        json={"rpe": 5},
        headers={**auth, "If-Match": run["token"]},
    ).json()
    rate(openrouter, "run", noted, 8)

    report = acted(ai_app_client, auth, "Finalement plutôt 8.")[0]

    assert (report["status"], report["level"]) == ("pending", "change")
    assert report["summary"] == "Remplacer l'effort perçu de la course (8 km) : 5/10 → 8/10."
    assert ai_app_client.get(f"/api/activity/runs/{run['id']}", headers=auth).json()["rpe"] == 5

    confirmed = ai_app_client.post(
        f"{ASSISTANT}/actions/confirm",
        json={"name": report["name"], "args": report["args"]},
        headers=auth,
    ).json()

    assert confirmed["status"] == "done", confirmed
    assert confirmed["undo"] is None, "un changement confirmé ne s'annule pas"
    assert ai_app_client.get(f"/api/activity/runs/{run['id']}", headers=auth).json()["rpe"] == 8


def test_an_effort_on_yesterdays_session_is_refused_by_the_server(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    run = a_run(ai_app_client, auth, day=YESTERDAY)
    rate(openrouter, "run", run, 6)

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "refused"
    assert "séance du jour" in report["summary"]
    assert ai_app_client.get(f"/api/activity/runs/{run['id']}", headers=auth).json()["rpe"] is None


def test_a_stale_token_is_a_conflict_not_a_permission(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    run = a_run(ai_app_client, auth)
    rate(openrouter, "run", {**run, "token": "perime"}, 6)

    report = acted(ai_app_client, auth)[0]

    assert report["status"] == "refused"
    assert report["code"] == "conflict"


def test_a_swim_a_walk_and_a_cadence_session_take_an_effort_too(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    """Quatre sortes, une échelle : c'est l'effort qui fait entrer chacune dans la charge."""
    swim = ai_app_client.post(
        "/api/activity/swims",
        json={"date": TODAY.isoformat(), "duration_min": 40, "program": PROGRAM},
        headers=auth,
    ).json()
    walk = ai_app_client.post(
        "/api/activity/others",
        json={"date": TODAY.isoformat(), "sport": "marche", "duration_min": 50},
        headers=auth,
    ).json()
    circuit = ai_app_client.post(
        "/api/activity/circuits",
        json={
            "name": "Abdos",
            "rounds": 2,
            "round_rest_s": 30,
            "exercises": [{"name": "Plank", "muscle_group": "abdos", "duration_s": 45}],
        },
        headers=auth,
    ).json()
    session = ai_app_client.post(
        f"/api/activity/circuits/{circuit['id']}/done", json={"duration_min": 12}, headers=auth
    ).json()
    before = ai_app_client.get("/api/training", headers=auth).json()["unrated"]

    for kind, row in (("swim", swim), ("other", walk), ("session", session)):
        rate(openrouter, kind, row, 4)
        report = acted(ai_app_client, auth)[0]
        assert report["status"] == "done", (kind, report)
        assert report["undo"]["domain"].startswith("activity/")

    assert sum(before.values()) == 3
    assert ai_app_client.get("/api/training", headers=auth).json()["unrated"] == {}


def test_the_condensed_view_names_todays_sessions_with_their_effort(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    run = a_run(ai_app_client, auth)
    a_run(ai_app_client, auth, day=YESTERDAY)
    openrouter.say(answer())

    acted(ai_app_client, auth, "Bonjour")

    prompt = openrouter.calls[0].prompt
    assert (
        "Aujourd'hui — course : 8 km, 48 min, allure 6 min/km, effort perçu non noté "
        f"(effort.rate : kind=run, row_id={run['id']}, token={run['token']})"
    ) in prompt
    assert prompt.count("effort.rate : kind=") == 1, "la course d'hier n'est pas nommée"
