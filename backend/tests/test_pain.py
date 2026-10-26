"""Les douleurs (`docs/douleurs.md`).

Quatre étages : la **réponse graduée**, pure ; les **routes**, sur le faux WebDAV ; la prise
sur le **coach** ; et le **suivi** — l'étape du matin et le rappel de midi. CA-09 du cahier
RunFurther est rejoué de bout en bout : 3/10 adapte, 7/10 vive arrête, et l'urgence n'est
jamais évoquée.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.dates import tz
from app.core.validation import today_local
from app.domains.activity import load
from app.domains.coach import frame
from app.domains.notifications.reminders import (
    PAIN_FOLLOW_UP,
    Checkpoint,
    DaySnapshot,
    ReminderKind,
    compose,
)
from app.domains.pain import rules
from tests.test_coach import hard_run

PAIN = "/api/pain"
DAY = date(2026, 10, 19)
TODAY = today_local()
YESTERDAY = TODAY - timedelta(days=1)


def report(day: date, intensity: int, **extra: Any) -> rules.Report:
    return rules.Report(day=day, intensity=intensity, **extra)


def episode(*reports: rules.Report, baseline: int = 1) -> rules.Episode:
    return rules.Episode(zone="Achille", side="right", baseline=baseline, reports=reports)


def opening(day: date = YESTERDAY, intensity: int = 3, **extra: Any) -> dict[str, Any]:
    return {
        "date": day.isoformat(),
        "zone": "Achille",
        "side": "right",
        "baseline": 1,
        "intensity": intensity,
        "moment": "after",
        "kind": "dull",
        **extra,
    }


def post(client: TestClient, auth: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
    response = client.post(PAIN, json=body, headers=auth)
    assert response.status_code == 201, response.text
    return dict(response.json())


# ── La réponse graduée ────────────────────────────────


def test_a_light_pain_above_its_baseline_adapts_the_session() -> None:
    judged = rules.judge(episode(report(DAY, 3)))

    assert judged.status == "adapt"
    assert "Séance adaptée" in judged.text
    assert "Silbernagel" in judged.text


@pytest.mark.parametrize(
    ("intensity", "extra", "sign"),
    [
        (7, {}, "au seuil d'arrêt"),
        (2, {"kind": "sharp"}, "vive"),
        (2, {"limp": True}, "avec boiterie"),
    ],
)
def test_each_qualifying_sign_stops_running_at_any_intensity(
    intensity: int, extra: dict[str, Any], sign: str
) -> None:
    judged = rules.judge(episode(report(DAY, intensity, **extra)))

    assert judged.status == "stop"
    assert sign in judged.signs
    assert "praticien" in judged.text


def test_six_without_any_sign_still_adapts() -> None:
    """Le seuil est 7 (décidé le 19/10) : 6 sans signe reste en séance adaptée."""
    assert rules.judge(episode(report(DAY, 6))).status == "adapt"


def test_the_first_rise_stops_running() -> None:
    judged = rules.judge(episode(report(DAY, 2), report(DAY + timedelta(days=1), 3)))

    assert judged.status == "stop"
    assert judged.signs == ("en hausse depuis le 19/10",)


def test_back_to_its_baseline_the_episode_closes_even_after_a_sharp_day() -> None:
    judged = rules.judge(
        episode(report(DAY, 5, kind="sharp"), report(DAY + timedelta(days=1), 1), baseline=1)
    )

    assert judged.status == "closed"
    assert judged.closed_on == DAY + timedelta(days=1)


def test_a_report_at_its_baseline_opens_nothing() -> None:
    assert rules.judge(episode(report(DAY, 2), baseline=2)).status == "closed"


def test_no_sentence_names_an_emergency_or_a_pathology() -> None:
    cases = [
        episode(report(DAY, 10, kind="sharp", limp=True)),
        episode(report(DAY, 3)),
        episode(report(DAY, 2), report(DAY + timedelta(days=1), 9)),
    ]
    for case in cases:
        text = rules.judge(case).text.casefold()
        for word in ("urgence", "samu", "15", "tendinite", "fracture", "entorse"):
            assert word not in text


def test_the_most_severe_open_episode_is_what_the_coach_reads() -> None:
    adapt = rules.judge(episode(report(DAY, 3)))
    stop = rules.judge(episode(report(DAY, 8)))

    assert rules.level([adapt, stop]) == ("stop", stop.text)
    assert rules.level([adapt]) == ("adapt", adapt.text)
    assert rules.level([]) == ("none", "")


# ── Par les routes ────────────────────────────────────


def test_an_opening_needs_a_zone_a_side_and_a_baseline(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    for missing in ("zone", "side", "baseline"):
        body = opening()
        del body[missing]
        response = store_client.post(PAIN, json=body, headers=auth)
        assert response.status_code == 422, missing


def test_the_moment_and_the_kind_are_never_defaulted(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    """Un défaut serait une valeur que personne n'a donnée, dans un fichier de mesures."""
    for missing in ("moment", "kind"):
        body = opening()
        del body[missing]
        assert store_client.post(PAIN, json=body, headers=auth).status_code == 422


def test_a_follow_up_joins_its_episode_and_keeps_its_place(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    opened = post(store_client, auth, opening(intensity=3))
    followed = post(
        store_client,
        auth,
        {
            "date": TODAY.isoformat(),
            "pain_id": opened["pain_id"],
            "intensity": 1,
            "moment": "next_day",
            "kind": "stiff",
            "source": "morning",
        },
    )

    assert followed["pain_id"] == opened["pain_id"]
    assert followed["zone"] == "Achille"
    assert followed["status"] == "closed"
    assert len(followed["reports"]) == 2

    view = store_client.get(PAIN, headers=auth).json()
    assert view["open"] == []
    assert [item["pain_id"] for item in view["closed"]] == [opened["pain_id"]]


def test_a_follow_up_of_an_unknown_episode_is_refused(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    body = {
        "date": TODAY.isoformat(),
        "pain_id": "inconnu",
        "intensity": 2,
        "moment": "next_day",
        "kind": "dull",
    }
    response = store_client.post(PAIN, json=body, headers=auth)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_an_open_pain_is_due_today_until_noted(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    post(store_client, auth, opening(intensity=3))

    episode_view = store_client.get(PAIN, headers=auth).json()["open"][0]
    assert episode_view["status"] == "adapt"
    assert episode_view["due_today"] is True
    assert episode_view["place"] == "(Achille, droit)"
    assert episode_view["title"] == "Achille · droit"


def test_no_pain_is_declared_once_per_run(store_client: TestClient, auth: dict[str, str]) -> None:
    body = {"date": YESTERDAY.isoformat(), "run_id": "abc123"}
    first = store_client.post(f"{PAIN}/none", json=body, headers=auth).json()
    second = store_client.post(f"{PAIN}/none", json=body, headers=auth).json()

    assert first["id"] == second["id"]
    view = store_client.get(PAIN, headers=auth).json()
    assert len(view["none"]) == 1
    assert view["open"] == view["closed"] == []


def test_deleting_needs_if_match(store_client: TestClient, auth: dict[str, str]) -> None:
    opened = post(store_client, auth, opening())
    row = opened["reports"][0]

    assert store_client.delete(f"{PAIN}/{row['id']}", headers=auth).status_code == 409
    headers = {**auth, "If-Match": row["token"]}
    assert store_client.delete(f"{PAIN}/{row['id']}", headers=headers).status_code == 204


def test_an_opening_with_follow_ups_cannot_be_deleted_first(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    opened = post(store_client, auth, opening(day=YESTERDAY - timedelta(days=1)))
    post(
        store_client,
        auth,
        {
            "date": YESTERDAY.isoformat(),
            "pain_id": opened["pain_id"],
            "intensity": 2,
            "moment": "next_day",
            "kind": "dull",
        },
    )
    first = next(
        item
        for item in store_client.get(PAIN, headers=auth).json()["open"][0]["reports"]
        if item["baseline"] is not None
    )
    response = store_client.delete(
        f"{PAIN}/{first['id']}", headers={**auth, "If-Match": first["token"]}
    )

    assert response.status_code == 422
    assert "suivis" in response.json()["message"]


# ── La prise sur le coach ─────────────────────────────


def _state(**extra: Any) -> frame.State:
    sessions = [
        load.Session(
            day=DAY - timedelta(days=offset),
            run_id=str(offset),
            duration_min=40,
            zone_seconds=(0.0, 2400.0, 0.0, 0.0, 0.0),
        )
        for offset in (2, 4, 6, 8)
    ]
    return frame.State(
        today=DAY,
        sessions=sessions,
        summary=load.summarize(DAY, sessions),
        measured_max=True,
        **extra,
    )


def test_an_adapted_pain_leaves_easy_running_without_more_volume() -> None:
    limits = frame.build(_state(pain="adapt", pain_text="Gêne (Achille, droit)."))

    assert "intervals" not in limits.allowed
    assert "long" not in limits.allowed
    assert "Gêne (Achille, droit)." in limits.reasons


def test_a_stopping_pain_leaves_rest_only_and_the_rules_choose_it() -> None:
    limits = frame.build(_state(pain="stop", pain_text="Douleur vive."))

    assert limits.allowed == ("rest",)
    assert frame.default_choice(limits).type == "rest"
    assert frame.check(limits, frame.Choice("easy", limits.slots[0].day, 30)) is not None


def test_ca09_a_sharp_seven_turns_the_proposal_into_rest(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    """CA-09 : une douleur vive et localisée à 7/10 au débrief — arrêt, séance suivante
    remplacée, relance à J+1, et pas un mot d'urgence."""
    run = hard_run(store_client, auth)
    before = store_client.get("/api/coach/next", headers=auth).json()["current"]
    assert before["type"] != "rest"

    post(
        store_client,
        auth,
        opening(intensity=7, kind="sharp", run_id=run["run_id"], source="import"),
    )

    after = store_client.get("/api/coach/next", headers=auth).json()["current"]
    assert after["type"] == "rest"
    assert "praticien" in after["adjusted"]
    assert "urgence" not in after["adjusted"].casefold()


def test_ca09_a_three_keeps_running_easy(store_client: TestClient, auth: dict[str, str]) -> None:
    hard_run(store_client, auth)
    post(store_client, auth, opening(intensity=3))

    after = store_client.get("/api/coach/next", headers=auth).json()["current"]
    assert after["type"] not in ("intervals", "threshold", "tempo", "hills", "test")


# ── Le suivi : le matin, et midi ──────────────────────


def test_the_morning_shows_the_pain_step_only_when_a_follow_up_is_due(
    store_client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    import importlib

    routes = importlib.import_module("app.domains.morning.router")
    moment = datetime.combine(TODAY, time(7, 0), tzinfo=tz())
    monkeypatch.setattr(routes, "now_local", lambda: moment)

    keys = [step["key"] for step in store_client.get("/api/morning", headers=auth).json()["steps"]]
    assert "pain" not in keys

    post(store_client, auth, opening(intensity=3))
    flow = store_client.get("/api/morning", headers=auth).json()
    assert [step["key"] for step in flow["steps"]][:2] == ["night", "pain"]
    assert flow["pain"][0]["due_today"] is True


def test_the_noon_reminder_says_what_is_not_noted() -> None:
    checkpoint = Checkpoint(kind=ReminderKind.PAIN, at=PAIN_FOLLOW_UP)

    assert compose(checkpoint, DaySnapshot()) is None
    reminder = compose(checkpoint, DaySnapshot(pain_due=("Achille droit",)))
    assert reminder is not None
    assert reminder.body == "Suivi pas encore noté aujourd'hui : Achille droit."
    assert reminder.payload()["url"] == "/corps/douleurs"
