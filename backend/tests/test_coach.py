"""Le coach (`docs/coach-course.md` §7, §8).

Trois étages, et chacun a ses cas : le **cadre**, pur, qui dit ce que la séance a le droit
d'être ; le **catalogue**, pur, qui en fait des étapes chiffrées ; le **service**, par les
routes, avec un modèle simulé — y compris un modèle qui sort du cadre deux fois. Aucun cas
ne touche OpenRouter.
"""

from __future__ import annotations

import io
import json
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

import fitdecode
import pytest
from fastapi.testclient import TestClient

from app.core.validation import today_local
from app.domains.activity import load
from app.domains.coach import catalog, frame, prompt
from app.storage.files import FileStore
from tests.fake_openrouter import FakeOpenRouter
from tests.fit_files import GarminExtras, paced, stream_file
from tests.test_activity_fit import import_fit, yesterday_at

DAY = date(2026, 9, 19)
NEXT = "/api/coach/next"


def session(day: date, minutes: float = 35, hard: bool = False) -> load.Session:
    zones = (0.0, 0.0, 0.0, minutes * 60, 0.0) if hard else (0.0, minutes * 60, 0.0, 0.0, 0.0)
    return load.Session(day=day, run_id=str(day), duration_min=minutes, zone_seconds=zones)


def state(sessions: list[load.Session], **extra: Any) -> frame.State:
    return frame.State(today=DAY, sessions=sessions, summary=load.summarize(DAY, sessions), **extra)


# ── Le cadre ──────────────────────────────────────────


def test_after_a_hard_run_the_next_hard_one_waits_48_hours() -> None:
    # Assez de facile autour pour que la répartition ne ferme pas, à elle seule, le dur.
    easy = [session(DAY - timedelta(days=offset), 40) for offset in (2, 4, 6, 8)]
    limits = frame.build(state([*easy, session(DAY, hard=True)], measured_max=True))

    assert limits.earliest_hard == DAY + timedelta(days=2)
    # Le lendemain est de toute façon sans course ; c'est le surlendemain qui se juge.
    after = frame.Choice("threshold", DAY + timedelta(days=2), 40, 2, 8)
    assert frame.check(limits, after) is None
    assert frame.check(limits, frame.Choice("easy", DAY + timedelta(days=2), 30)) is None


def test_never_two_running_days_in_a_row() -> None:
    """La règle du 20/09 : le lendemain d'une sortie reste sans course, quel qu'en soit le
    type — plus forte que les 48 h entre séances dures, qui ne bornent que celles-là."""
    limits = frame.build(state([session(DAY)], measured_max=True))
    tomorrow = DAY + timedelta(days=1)

    assert tomorrow not in {slot.day for slot in limits.slots}
    assert limits.slots[0].day == DAY + timedelta(days=2)
    assert frame.check(limits, frame.Choice("easy", tomorrow, 30)) == (
        "Pas de course le lendemain d'une sortie."
    )
    assert any("Jamais deux jours de course d'affilée" in reason for reason in limits.reasons)


def test_a_planned_slot_the_day_after_a_run_is_refused_and_another_day_offered() -> None:
    slot = frame.Slot(day=DAY + timedelta(days=1), time="07:00", duration_min=40)
    limits = frame.build(state([session(DAY)], planned=[slot], measured_max=True))

    assert slot not in limits.slots
    assert limits.slots[0].day == DAY + timedelta(days=2)
    assert any("lendemain d'une sortie" in reason for reason in limits.reasons)


def test_a_week_far_above_the_usual_allows_easy_running_only() -> None:
    usual = [session(DAY - timedelta(days=offset)) for offset in range(9, 29, 3)]
    week = [session(DAY - timedelta(days=offset), 80) for offset in (1, 3, 5)]
    limits = frame.build(state([*usual, *week], measured_max=True))

    assert not set(limits.allowed) & catalog.HARD
    assert any("du facile seulement" in reason for reason in limits.reasons)


def test_the_planning_decides_the_days() -> None:
    """**C13** : le rythme est celui du planning — ses créneaux course, et eux seuls."""
    slot = frame.Slot(day=DAY + timedelta(days=2), time="07:00", duration_min=40)
    limits = frame.build(state([session(DAY)], planned=[slot]))

    assert limits.slots == (slot,)
    assert "lendemain d'une sortie" in (
        frame.check(limits, frame.Choice("easy", DAY + timedelta(days=1), 30)) or ""
    )
    assert "n'est pas l'un des jours" in (
        frame.check(limits, frame.Choice("easy", DAY + timedelta(days=3), 30)) or ""
    )
    assert "entre 20 et 38 min" in (frame.check(limits, frame.Choice("easy", slot.day, 45)) or "")


def test_without_planning_seven_days_are_offered_and_it_says_so() -> None:
    limits = frame.build(state([session(DAY)]))

    # Sept jours d'horizon, moins le lendemain de la sortie.
    assert len(limits.slots) == 6
    assert limits.slots[0].day == DAY + timedelta(days=2)
    assert any("Aucun créneau course" in reason for reason in limits.reasons)


def test_no_hard_session_the_day_after_legs() -> None:
    limits = frame.build(
        state([session(DAY - timedelta(days=5))], legs_days=frozenset({DAY}), measured_max=True)
    )
    choice = frame.Choice("intervals", DAY + timedelta(days=1), 45, 6, 3)
    assert frame.check(limits, choice) == "Pas de séance dure le lendemain d'une séance de jambes."


def test_an_unmeasured_max_heart_rate_calls_for_a_test() -> None:
    """**C4** : tant que la FC max n'a pas été mesurée, le cadre propose de la mesurer."""
    limits = frame.build(state([session(DAY - timedelta(days=4))]))

    assert limits.test_due
    assert "test" in limits.allowed
    assert frame.default_choice(limits).type == "test"


def test_a_five_km_close_to_the_one_km_points_at_speed() -> None:
    """Le 19/09 : 1 km en 5:36, 5 km en 29:07 — exposant 1,02."""
    limits = frame.build(state([session(DAY)], efforts={1000: 336, 5000: 1747}))
    assert limits.focus[0].startswith("Vitesse")


def test_this_morning_lightens_today() -> None:
    limits = frame.build(state([session(DAY - timedelta(days=3))], readiness="lighten"))

    assert limits.slots[0].day == DAY
    assert not set(limits.allowed) & catalog.HARD


# ── Le catalogue ──────────────────────────────────────


def test_targets_come_from_the_references_never_from_the_model() -> None:
    refs = catalog.References(max_hr=202, threshold=5.25)
    [easy] = catalog.steps("easy", 40, refs)

    assert easy.target == "121–140 bpm · 5:59–6:46 /km"
    assert (easy.hr_low, easy.hr_high) == (121, 140)


def test_without_any_reference_a_step_says_how_it_should_feel() -> None:
    [easy] = catalog.steps("easy", 40, catalog.References())
    assert easy.target == "à l'aise, tu parles"
    assert easy.hr_high is None


def test_a_block_session_adds_up_to_its_duration() -> None:
    steps = catalog.steps("threshold", 50, catalog.References(), reps=3, rep_min=8)
    total = sum((step.duration_s or 0) * (step.repeat or 1) for step in steps)
    recover = next(step for step in steps if step.kind == "recover")
    assert total + (recover.duration_s or 0) * 2 == 50 * 60


# ── La relecture ──────────────────────────────────────


def test_an_unknown_type_is_refused_in_so_many_words() -> None:
    choice, reason = prompt.read_choice({"type": "marathon", "date": "2026-09-20"})
    assert choice is None
    assert "type inconnu" in reason


def test_a_choice_is_read_with_its_explanation() -> None:
    choice, reason = prompt.read_choice(
        {"type": "easy", "date": "2026-09-20", "duration_min": 35, "rationale": "Du **facile**."}
    )
    assert choice == frame.Choice("easy", date(2026, 9, 20), 35)
    assert reason == "Du **facile**."


# ── Par les routes ────────────────────────────────────


def hard_run(client: TestClient, auth: dict[str, str]) -> dict[str, Any]:
    """La sortie du 19/09, hier : effet aérobie 3,8, donc une séance dure."""
    data = stream_file(
        paced((5000, 5.8)),
        start=yesterday_at(),
        heart_rates=[165],
        powers=[252],
        garmin=GarminExtras(watch_max_hr=202, session={"total_training_effect": 3.8}),
    )
    response = import_fit(client, auth, data)
    assert response.status_code == 201, response.text
    return dict(response.json())


def test_an_import_brings_a_proposal_from_the_rules_without_a_model(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    created = hard_run(store_client, auth)

    body = store_client.get(NEXT, headers=auth).json()
    current = body["current"]
    assert current["source"] == "rules"
    assert current["trigger_run_id"] == created["run_id"]
    assert current["rationale"].startswith("Choisie par les règles")
    # Hier une séance dure : rien de dur avant demain.
    if current["type"] in catalog.HARD:
        assert current["date"] >= (today_local() + timedelta(days=1)).isoformat()
    assert current["frame"]


def test_the_model_chooses_inside_the_frame_and_its_text_is_kept(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    # Hier une sortie : aujourd'hui est un jour sans course, le modèle choisit demain.
    chosen = (today_local() + timedelta(days=1)).isoformat()
    openrouter.say(
        json.dumps(
            {
                "type": "easy",
                "date": chosen,
                "duration_min": 30,
                "reps": None,
                "rep_min": None,
                "rationale": "Hier était **dur** : du facile aujourd'hui.",
            }
        )
    )
    hard_run(ai_app_client, auth)

    current = ai_app_client.get(NEXT, headers=auth).json()["current"]
    assert current["source"] == "model"
    assert current["type"] == "easy"
    assert current["rationale"] == "Hier était **dur** : du facile aujourd'hui."
    # Les cibles viennent des zones — FC contre 202, allure contre le seuil déduit de la
    # sortie elle-même —, jamais du modèle, qui n'en a rendu aucune.
    assert current["steps"][0]["target"].startswith("121–140 bpm · ")


def test_a_model_out_of_the_frame_twice_gives_way_to_the_rules(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    greedy = json.dumps(
        {
            "type": "intervals",
            "date": (today_local() + timedelta(days=1)).isoformat(),
            "duration_min": 45,
            "reps": 6,
            "rep_min": 3,
            "rationale": "On enchaîne.",
        }
    )
    openrouter.say(greedy, greedy)
    hard_run(ai_app_client, auth)

    current = ai_app_client.get(NEXT, headers=auth).json()["current"]
    assert current["source"] == "rules"
    assert "le modèle n'ayant pas rendu de choix dans le cadre" in current["rationale"]
    # La seconde demande nommait la violation.
    second = openrouter.calls[-1]
    assert "sortait du cadre" in json.dumps(second.body, ensure_ascii=False)


def test_accepting_writes_the_session_to_the_planning_marked_ai(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    hard_run(store_client, auth)
    proposed = store_client.get(NEXT, headers=auth).json()["current"]

    accepted = store_client.post(f"{NEXT}/accept", json={}, headers=auth).json()["current"]
    assert accepted["status"] == "accepted"
    assert accepted["plan_session_id"]

    month = proposed["date"][:7]
    planned = store_client.get(f"/api/planning/month?month={month}", headers=auth).json()
    sessions = [item for day in planned["days"] for item in day["planned"]]
    mine = [item for item in sessions if item["session_id"] == accepted["plan_session_id"]]
    assert mine and mine[0]["source"] == "ai"
    assert mine[0]["note"].startswith("Proposée par le coach")


def test_refusing_leaves_nothing_active(store_client: TestClient, auth: dict[str, str]) -> None:
    hard_run(store_client, auth)
    body = store_client.post(f"{NEXT}/refuse", headers=auth).json()

    assert body["current"] is None
    assert body["missing"]


def test_a_hard_session_today_is_lightened_by_a_bad_morning(
    store_client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """La réévaluation du matin : une règle, sans rappeler le modèle."""
    monkeypatch.setattr(frame, "default_choice", _intervals_today)
    # Une sortie d'avant-hier : aujourd'hui n'est pas un lendemain de course, et la séance
    # du jour se juge donc sur la forme du matin.
    older_run(store_client, auth, days=2)
    today = today_local()
    for offset in range(1, 16):
        store_client.post(
            "/api/body/morning",
            json={"date": (today - timedelta(days=offset)).isoformat(), "resting_hr": 50},
            headers=auth,
        )
    store_client.post(
        "/api/body/morning", json={"date": today.isoformat(), "resting_hr": 59}, headers=auth
    )

    current = store_client.get(NEXT, headers=auth).json()["current"]
    assert current["type"] == "recovery"
    assert current["adjusted"].startswith("Allégée ce matin.")


def older_run(client: TestClient, auth: dict[str, str], *, days: int) -> dict[str, Any]:
    """Une sortie d'il y a `days` jours, cardio et effet d'entraînement compris."""
    start = datetime.combine(
        today_local() - timedelta(days=days), time(6, 0), tzinfo=UTC
    ) - timedelta(hours=2)
    data = stream_file(
        paced((5000, 5.8)),
        start=start,
        heart_rates=[165],
        powers=[252],
        garmin=GarminExtras(watch_max_hr=202, session={"total_training_effect": 3.8}),
    )
    response = import_fit(client, auth, data)
    assert response.status_code == 201, response.text
    return dict(response.json())


def _intervals_today(limits: frame.Frame) -> frame.Choice:
    return frame.Choice("intervals", limits.slots[0].day, 45, 6, 3)


def test_the_workout_file_is_read_back_by_a_fit_reader(
    store_client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(frame, "default_choice", _intervals_today)
    hard_run(store_client, auth)

    response = store_client.get(f"{NEXT}/workout.fit", headers=auth)
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]

    steps = []
    with fitdecode.FitReader(io.BytesIO(response.content)) as reader:
        for frame_ in reader:
            if isinstance(frame_, fitdecode.FitDataMessage) and frame_.name == "workout_step":
                steps.append({item.name: item.value for item in frame_.fields})
    repeat = next(step for step in steps if step["duration_type"] == "repeat_until_steps_cmplt")
    assert repeat["repeat_steps"] == 6
    block = steps[1]
    assert block["duration_time"] == 180
    # FC personnalisée : bpm + 100. Zone 5 contre 202 : au-dessus de 182.
    assert block["custom_target_heart_rate_low"] == 182 + 100


def test_an_easy_run_has_no_file_to_guide(
    store_client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        frame, "default_choice", lambda limits: frame.Choice("easy", limits.slots[0].day, 30)
    )
    hard_run(store_client, auth)
    assert store_client.get(f"{NEXT}/workout.fit", headers=auth).status_code == 404


# ── L'annonce de la veille (**C8**) ───────────────────


def test_the_eve_announces_tomorrow_and_nothing_without_a_proposal() -> None:
    from app.domains.notifications.reminders import (
        EVE,
        Checkpoint,
        DaySnapshot,
        ReminderKind,
        compose,
    )

    checkpoint = Checkpoint(ReminderKind.TOMORROW_RUN, EVE)
    assert compose(checkpoint, DaySnapshot()) is None

    reminder = compose(checkpoint, DaySnapshot(tomorrow_run="Footing en endurance, 40 min."))
    assert reminder is not None
    assert reminder.title == "Demain"
    assert reminder.payload()["url"] == "/planning"


def test_the_eve_sentence_names_the_session_and_its_target(
    store_client: TestClient,
    auth: dict[str, str],
    store: FileStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio

    from app.domains.notifications.scheduler import ReminderScheduler

    monkeypatch.setattr(
        frame,
        "default_choice",
        lambda limits: frame.Choice("easy", today_local() + timedelta(days=1), 40),
    )
    hard_run(store_client, auth)

    scheduler = ReminderScheduler(store, None)  # type: ignore[arg-type]
    sentence = asyncio.run(scheduler._tomorrow_run(today_local()))
    assert sentence.startswith("Footing en endurance, 40 min · 121–140 bpm")


# ── Jamais deux jours d'affilée, après coup ───────────


def test_a_run_the_day_before_turns_the_session_into_a_day_off(
    store_client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """La sortie non prévue de la veille désarme la séance du jour, sans rappeler le modèle."""
    today = today_local()
    monkeypatch.setattr(frame, "default_choice", lambda limits: frame.Choice("easy", today, 35))
    # La proposition est faite avant la sortie : le cadre d'alors permettait aujourd'hui.
    hard_run(store_client, auth)

    current = store_client.get(NEXT, headers=auth).json()["current"]
    assert current["type"] == "rest"
    assert current["title"] == "Repos"
    assert current["adjusted"].startswith("Tu as couru la veille")
    assert current["workout"] is False

    refused = store_client.post(f"{NEXT}/accept", json={}, headers=auth)
    assert refused.status_code == 422
    assert "jour sans course" in refused.json()["message"]
