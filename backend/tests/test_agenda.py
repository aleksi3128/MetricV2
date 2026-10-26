"""L'agenda et la replanification (`docs/agenda-replanification.md`).

Trois modules purs : le lecteur ICS, le placement dans les créneaux libres, et les règles
qui modifient le planning. Puis les routes : le lien d'agenda, la passe de replanification,
et le « non » qui défait.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.core.validation import today_local
from app.domains.assistant import actions
from app.domains.planning import agenda, ics, placement, replan
from app.storage.files import FileStore

PARIS = ZoneInfo("Europe/Paris")
MONDAY = date(2026, 10, 19)

CALENDAR = "\r\n".join(
    [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VTIMEZONE",
        "TZID:Europe/Paris",
        "BEGIN:STANDARD",
        "DTSTART:19701025T030000",
        "END:STANDARD",
        "END:VTIMEZONE",
        # Cours du mardi et du jeudi, 18 h → 20 h, toutes les semaines, sauf le jeudi 22.
        "BEGIN:VEVENT",
        "SUMMARY:Cours du soir — ne doit jamais sortir d'ici",
        "DTSTART;TZID=Europe/Paris:20261013T180000",
        "DTEND;TZID=Europe/Paris:20261013T200000",
        "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261231T235959Z",
        "EXDATE;TZID=Europe/Paris:20261022T180000",
        "BEGIN:VALARM",
        "TRIGGER:-PT15M",
        "END:VALARM",
        "END:VEVENT",
        # Stage, mercredi, en UTC.
        "BEGIN:VEVENT",
        "DTSTART:20261021T070000Z",
        "DTEND:20261021T160000Z",
        "END:VEVENT",
        # Une journée entière, le vendredi.
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20261023",
        "DTEND;VALUE=DATE:20261024",
        "END:VEVENT",
        # Annulé, et transparent : ne bloquent rien.
        "BEGIN:VEVENT",
        "STATUS:CANCELLED",
        "DTSTART;TZID=Europe/Paris:20261020T120000",
        "DTEND;TZID=Europe/Paris:20261020T130000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "TRANSP:TRANSPARENT",
        "DTSTART;TZID=Europe/Paris:20261020T080000",
        "DURATION:PT1H",
        "END:VEVENT",
        # Une règle mensuelle : comptée à sa première date seulement.
        "BEGIN:VEVENT",
        "DTSTART;TZID=Europe/Paris:20261019T090000",
        "DTEND;TZID=Europe/Paris:20261019T100000",
        "RRULE:FREQ=MONTHLY;BYDAY=2TU",
        "END:VEVENT",
        # Une ligne pliée.
        "BEGIN:VEVENT",
        "DTSTART;TZID=Europe/Paris:20261024T100000",
        "DTEND;TZID=Europe/Paris:202610",
        " 24T113000",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
)


def at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute))


def week() -> ics.Reading:
    return ics.read(CALENDAR, MONDAY, MONDAY + timedelta(days=6), PARIS)


# ── Le lecteur ICS ────────────────────────────────────


def test_weekly_classes_are_unfolded_with_their_exception() -> None:
    starts = [item.start for item in week().busy]

    assert at(MONDAY + timedelta(days=1), 18) in starts  # mardi 20
    assert at(MONDAY + timedelta(days=3), 18) not in starts  # jeudi 22, en exception
    assert at(MONDAY - timedelta(days=6), 18) not in starts  # avant la fenêtre


def test_utc_all_day_folded_cancelled_and_transparent() -> None:
    busy = week().busy
    spans = {(item.start, item.end) for item in busy}

    assert (at(date(2026, 10, 21), 9), at(date(2026, 10, 21), 18)) in spans  # UTC → Paris
    assert (at(date(2026, 10, 23), 0), at(date(2026, 10, 24), 0)) in spans  # journée entière
    assert (at(date(2026, 10, 24), 10), at(date(2026, 10, 24), 11, 30)) in spans  # ligne pliée
    assert not any(item.start == at(date(2026, 10, 20), 12) for item in busy)  # annulé
    assert not any(item.start == at(date(2026, 10, 20), 8) for item in busy)  # transparent


def test_an_unsupported_rule_counts_once_and_is_reported() -> None:
    reading = week()
    assert reading.unsupported == 1
    # Le lundi 19 à 9 h : sa première date, et aucune autre occurrence dépliée.
    monthly = [
        item
        for item in reading.busy
        if item.start.time() == time(9) and item.end.time() == time(10)
    ]
    assert [item.start for item in monthly] == [at(MONDAY, 9)]


def test_nothing_but_the_slot_is_kept() -> None:
    assert not hasattr(week().busy[0], "summary")
    assert "ne doit jamais sortir" not in repr(week())


# ── Le placement ──────────────────────────────────────


def test_the_evening_first_around_the_classes() -> None:
    tuesday = MONDAY + timedelta(days=1)
    # Cours de 18 h à 20 h, 30 min de marge : 17 h → 17 h 30 ne tient pas 45 min, 20 h 30 oui.
    assert placement.free_slot(tuesday, 45, week().busy) == time(20, 30)
    assert placement.free_slot(tuesday, 90, week().busy) == time(7, 0)


def test_a_full_day_sends_the_session_next_door() -> None:
    friday = date(2026, 10, 23)
    assert placement.free_slot(friday, 40, week().busy) is None
    assert placement.place(friday, 40, week().busy) == (date(2026, 10, 24), time(17, 0))
    assert placement.place(friday, 40, week().busy, forbidden={date(2026, 10, 24)}) == (
        date(2026, 10, 22),
        time(17, 0),
    )


# ── La replanification ────────────────────────────────


def planned(
    sid: str, day: date, title: str = "Endurance fondamentale", **extra: object
) -> replan.Planned:
    return replan.Planned(
        session_id=sid,
        day=day,
        time=extra.get("time"),  # type: ignore[arg-type]
        kind=str(extra.get("kind", "course")),
        title=title,
        minutes=int(extra.get("minutes", 45)),  # type: ignore[call-overload]
        note=str(extra.get("note", "")),
    )


def test_a_stopping_pain_turns_the_week_into_rest_but_never_the_race() -> None:
    sessions = [
        planned("a", MONDAY + timedelta(days=1), "Seuil"),
        planned("b", MONDAY + timedelta(days=3)),
        planned("r", MONDAY + timedelta(days=6), "10 km", note="Course : 10 km — priorité A"),
    ]
    found = replan.changes(MONDAY, sessions, set(), pain="stop", pain_text="Douleur vive.")

    assert {item.session_id: item.action for item in found} == {"a": "rest", "b": "rest"}
    assert all("la douleur passe avant le plan" in item.reason for item in found)


def test_an_adapted_pain_lightens_only_the_hard_sessions() -> None:
    sessions = [
        planned("a", MONDAY + timedelta(days=1), "Seuil", note="15' EF + 3 × 6' T r2' + 10' RC"),
        planned("b", MONDAY + timedelta(days=3)),
    ]
    found = replan.changes(MONDAY, sessions, set(), pain="adapt", pain_text="Gêne.")
    assert [(item.session_id, item.action, item.title) for item in found] == [
        ("a", "lighten", "Endurance fondamentale")
    ]


def test_a_missed_easy_run_is_dropped_and_a_missed_long_run_moves() -> None:
    sunday = MONDAY + timedelta(days=6)
    sessions = [
        planned("easy", MONDAY + timedelta(days=1)),
        planned("long", MONDAY + timedelta(days=3), "Sortie longue", note="12 km SL"),
    ]
    today = MONDAY + timedelta(days=4)  # vendredi : mardi et jeudi sont passés, rien de couru
    found = {item.session_id: item for item in replan.changes(today, sessions, set())}

    assert found["long"].action == "move"
    # Vendredi : le jeudi n'a pas été couru, il ne bloque donc pas le lendemain.
    assert found["long"].day == today
    assert found["long"].day <= sunday
    # Le mardi est à plus de deux jours : hors de la fenêtre des séances ratées.
    assert "easy" not in found


def test_a_run_done_is_not_missed() -> None:
    day = MONDAY + timedelta(days=3)
    found = replan.changes(day + timedelta(days=1), [planned("a", day, "Seuil")], {day})
    assert found == []


def test_a_key_already_applied_is_never_redone() -> None:
    sessions = [planned("a", MONDAY + timedelta(days=1), "Seuil")]
    first = replan.changes(MONDAY, sessions, set(), pain="stop", pain_text="x")
    assert (
        replan.changes(MONDAY, sessions, set(), pain="stop", pain_text="x", done={first[0].key})
        == []
    )


def test_a_session_on_a_busy_slot_changes_hour() -> None:
    tuesday = MONDAY + timedelta(days=1)
    sessions = [planned("a", tuesday, time="18:30")]
    found = replan.changes(MONDAY, sessions, set(), busy=week().busy)

    assert found[0].action == "move"
    assert (found[0].day, found[0].time) == (tuesday, "20:30")
    assert "créneau pris de ton agenda" in found[0].reason


# ── Par les routes ────────────────────────────────────


TODAY = today_local()
SECRET_URL = "https://p53-caldav.icloud.com/published/2/SECRETSECRETSECRETabcd"


@pytest.fixture
def fake_agenda(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Le lien n'est jamais appelé pour de vrai : `fetch_text` rend un agenda d'essai."""
    fetched: list[str] = []

    async def fetch(url: str) -> str:
        fetched.append(url)
        day = TODAY + timedelta(days=1)
        return "\r\n".join(
            [
                "BEGIN:VCALENDAR",
                "BEGIN:VEVENT",
                f"DTSTART;TZID=Europe/Paris:{day:%Y%m%d}T170000",
                f"DTEND;TZID=Europe/Paris:{day:%Y%m%d}T200000",
                "END:VEVENT",
                "END:VCALENDAR",
            ]
        )

    agenda.forget()
    monkeypatch.setattr(agenda, "fetch_text", fetch)
    return fetched


def _plan(
    client: TestClient, auth: dict[str, str], day: date, title: str, **extra: Any
) -> dict[str, Any]:
    response = client.post(
        "/api/planning/sessions",
        json={
            "date": day.isoformat(),
            "kind": "course",
            "title": title,
            "duration_min": 45,
            **extra,
        },
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return dict(response.json())


def _sessions(client: TestClient, auth: dict[str, str], day: date) -> list[dict[str, Any]]:
    month = client.get(f"/api/planning/month?month={day:%Y-%m}", headers=auth).json()
    return [
        item
        for cell in month["days"]
        if cell["date"] == day.isoformat()
        for item in cell["planned"]
    ]


def test_the_agenda_link_is_kept_server_side_and_never_sent_back(
    store_client: TestClient, auth: dict[str, str], fake_agenda: list[str]
) -> None:
    assert store_client.get("/api/planning/agenda", headers=auth).json()["configured"] is False
    refused = store_client.patch("/api/planning/agenda", json={"url": "ftp://x"}, headers=auth)
    assert refused.status_code == 422

    view = store_client.patch(
        "/api/planning/agenda",
        json={"url": SECRET_URL.replace("https://", "webcal://")},
        headers=auth,
    ).json()
    assert view == {
        "configured": True,
        "hint": "p53-caldav.icloud.com · …abcd",
        "events": 1,
        "unsupported": 0,
        "error": None,
    }
    assert fake_agenda == [SECRET_URL]
    assert "SECRET" not in store_client.get("/api/planning/agenda", headers=auth).text


def test_a_stopping_pain_rests_the_week_and_no_restores_it(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    tomorrow = TODAY + timedelta(days=1)
    _plan(store_client, auth, tomorrow, "Seuil", note="15' EF + 3 × 6' T r2' + 10' RC")
    store_client.post(
        "/api/pain",
        json={
            "date": TODAY.isoformat(),
            "zone": "Genou",
            "side": "left",
            "baseline": 0,
            "intensity": 7,
            "moment": "after",
            "kind": "sharp",
        },
        headers=auth,
    )

    pending = store_client.post("/api/planning/replan", headers=auth).json()
    assert [item["action"] for item in pending] == ["rest"]
    assert pending[0]["summary"].startswith("Seuil → Repos")
    assert _sessions(store_client, auth, tomorrow)[0]["title"] == "Repos"
    # Rejouée, la passe ne refait rien : la clé est au journal.
    assert len(store_client.post("/api/planning/replan", headers=auth).json()) == 1

    left = store_client.post(
        f"/api/planning/changes/{pending[0]['key']}", json={"accept": False}, headers=auth
    ).json()
    assert left == []
    assert _sessions(store_client, auth, tomorrow)[0]["title"] == "Seuil"


def test_no_is_refused_when_the_session_was_edited_since(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    yesterday = TODAY - timedelta(days=1)
    _plan(store_client, auth, yesterday, "Sortie longue", note="12 km SL")
    change = store_client.post("/api/planning/replan", headers=auth).json()[0]
    assert change["action"] in ("move", "drop")

    if change["action"] == "move":
        moved = _sessions(store_client, auth, date.fromisoformat(change["date"]))[0]
        store_client.patch(
            f"/api/planning/sessions/{moved['id']}",
            json={
                "date": moved["date"],
                "kind": "course",
                "title": "Sortie longue courte",
                "duration_min": 30,
            },
            headers={**auth, "If-Match": moved["token"]},
        )
        refused = store_client.post(
            f"/api/planning/changes/{change['key']}", json={"accept": False}, headers=auth
        )
        assert refused.status_code == 422
        assert "retouchée" in refused.json()["message"]


def test_a_missed_easy_run_is_dropped_and_comes_back_on_no(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    yesterday = TODAY - timedelta(days=1)
    _plan(store_client, auth, yesterday, "Endurance fondamentale")
    change = store_client.post("/api/planning/replan", headers=auth).json()[0]
    assert change["action"] == "drop"
    assert _sessions(store_client, auth, yesterday) == []

    store_client.post(
        f"/api/planning/changes/{change['key']}", json={"accept": False}, headers=auth
    )
    assert [item["title"] for item in _sessions(store_client, auth, yesterday)] == [
        "Endurance fondamentale"
    ]


def test_the_evening_point_asks_about_pending_changes(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    _plan(store_client, auth, TODAY - timedelta(days=1), "Endurance fondamentale")
    store_client.post("/api/planning/replan", headers=auth)
    assert len(store_client.get("/api/evening", headers=auth).json()["changes"]) == 1


def test_a_plan_is_placed_around_the_agenda(
    store_client: TestClient, auth: dict[str, str], fake_agenda: list[str]
) -> None:
    store_client.patch("/api/planning/agenda", json={"url": SECRET_URL}, headers=auth)
    race = store_client.post(
        "/api/races",
        json={
            "name": "10 km",
            "date": (TODAY + timedelta(weeks=6)).isoformat(),
            "distance": "10k",
            "priority": "A",
        },
        headers=auth,
    ).json()
    store_client.post(f"/api/races/plan/{race['next_a']}", headers=auth)

    month = store_client.get(
        f"/api/planning/month?month={TODAY + timedelta(weeks=2):%Y-%m}", headers=auth
    ).json()
    planned = [
        item for cell in month["days"] for item in cell["planned"] if item["source"] == "plan"
    ]
    timed = [item for item in planned if item["time"]]
    assert timed, "l'agenda réglé donne une heure à chaque séance"
    assert all(item["time"] >= "07:00" for item in timed)


def test_on_decale_moves_a_session_with_its_token(
    store: FileStore, store_client: TestClient, auth: dict[str, str]
) -> None:
    session = _plan(store_client, auth, TODAY + timedelta(days=2), "Seuil")
    checked = actions.validate(
        "plan.move",
        {
            "row_id": session["id"],
            "token": session["token"],
            "date": (TODAY + timedelta(days=3)).isoformat(),
            "time": "18:30",
        },
    )
    assert not isinstance(checked, str)
    spec, payload = checked

    async def run() -> actions.Outcome:
        return await spec.run(store, payload)

    outcome = asyncio.run(run())
    assert outcome.summary.startswith("Seuil décalée au")
    assert _sessions(store_client, auth, TODAY + timedelta(days=3))[0]["time"] == "18:30"


def test_today_is_placed_after_now_never_in_the_past() -> None:
    tuesday = MONDAY + timedelta(days=1)
    assert placement.free_slot(tuesday, 90, week().busy) == time(7, 0)
    # 30 minutes tiennent à 17 h, juste avant la marge du cours de 18 h.
    assert placement.free_slot(tuesday, 30, week().busy, not_before=at(tuesday, 9, 10)) == time(
        17, 0
    )
    assert placement.free_slot(tuesday, 30, week().busy, not_before=at(tuesday, 17, 5)) == time(
        20, 30
    )
    assert placement.free_slot(tuesday, 90, week().busy, not_before=at(tuesday, 9, 10)) == time(
        9, 15
    )
