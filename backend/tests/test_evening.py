"""Ce qui insiste — le point du soir, ses relances, les heures calmes (`docs/notifications-v3.md`).

CA-06 du cahier RunFurther est rejoué tel quel sur l'ordonnanceur : relance toutes les
3 minutes de 19 h à minuit ; après « rappelle-moi dans 30 min », silence 30 minutes puis
reprise ; une alerte critique passe malgré les heures calmes.

Les charges utiles partent chiffrées vers le faux service push : on compte les envois, et
on lit **ce qui est consigné** dans `sent.csv` — c'est la mémoire de l'ordonnanceur.
"""

from __future__ import annotations

import asyncio
import importlib
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.core.dates import tz
from app.core.validation import today_local
from app.domains.evening.service import EveningService, signature
from app.domains.notifications import escalation
from app.domains.notifications.escalation import EveningSettings, EveningState
from app.domains.notifications.push import PushSender
from app.domains.notifications.scheduler import ReminderScheduler
from app.storage.files import FileStore
from tests.conftest import TEST_AUTH, TEST_ENDPOINT, TEST_P256DH
from tests.fake_webdav import FakeWebDav
from tests.fake_webpush import FakeWebPush

PARIS = ZoneInfo("Europe/Paris")
JOUR = date(2026, 10, 8)
SETTINGS = "Metric/settings/settings.csv"
SUBSCRIPTIONS = "Metric/notifications/subscriptions.csv"
SENT = "Metric/notifications/sent.csv"
PAIN = "Metric/body/pain.csv"
TODAY = today_local()


def at(hour: int, minute: int = 0, day: date = JOUR) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=PARIS)


# ── Les règles ────────────────────────────────────────


def test_quiet_hours_can_cross_midnight() -> None:
    assert escalation.quiet(at(23, 30), time(23, 0), time(7, 0))
    assert escalation.quiet(at(3), time(23, 0), time(7, 0))
    assert not escalation.quiet(at(12), time(23, 0), time(7, 0))
    assert escalation.quiet(at(3), time(0, 0), time(7, 0))
    assert not escalation.quiet(at(7), time(0, 0), time(7, 0))


@pytest.mark.parametrize(
    ("moment", "state", "due"),
    [
        (at(18, 59), EveningState(), False),
        (at(19), EveningState(), True),
        (at(23, 59), EveningState(), True),
        (at(19, 30), EveningState(done=True), False),
        (at(19, 2), EveningState(sent=1, last=at(19)), False),
        (at(19, 3), EveningState(sent=1, last=at(19)), True),
        (at(19, 20), EveningState(snoozed_until=at(19, 35), sent=2, last=at(19, 3)), False),
        (at(19, 35), EveningState(snoozed_until=at(19, 35), sent=2, last=at(19, 3)), True),
        (at(21), EveningState(sent=100, last=at(20, 57)), False),
    ],
)
def test_when_a_relance_is_due(moment: datetime, state: EveningState, due: bool) -> None:
    assert escalation.evening_due(moment, EveningSettings(), state) is due


def test_a_relance_says_what_is_pending_never_what_was_not_done() -> None:
    first = escalation.compose_evening(0)
    later = escalation.compose_evening(5)
    for title, body in (first, later):
        assert title == "Point du soir"
        assert "pas fait" not in body and "rien" not in body
    assert first != later


# ── L'ordonnanceur : CA-06 ────────────────────────────


def _seed(dav: FakeWebDav, settings: str = "") -> None:
    dav.seed(SETTINGS, f"key,value\n{settings}")
    dav.seed(
        SUBSCRIPTIONS,
        "id,created,endpoint,p256dh,auth,user_agent\n"
        f"app1,2026-08-01,{TEST_ENDPOINT},{TEST_P256DH},{TEST_AUTH},iPhone\n",
    )


def _tick(store: FileStore, sender: PushSender, moment: datetime) -> None:
    scheduler = ReminderScheduler(store, sender, now=lambda: moment, secret="s" * 40)
    asyncio.run(scheduler.tick())


def _sent(dav: FakeWebDav, kind: str) -> list[str]:
    if SENT not in dav.files:
        return []
    lines = dav.content_of(SENT).splitlines()[1:]
    return [line for line in lines if f",{kind}," in line]


def test_ca06_every_three_minutes_from_seven_until_answered(
    store: FileStore, push_sender: PushSender, dav: FakeWebDav, webpush: FakeWebPush
) -> None:
    _seed(dav)
    for minute in range(0, 10):
        _tick(store, push_sender, at(19, minute))

    # 19:00, 19:03, 19:06, 19:09 — quatre relances en dix minutes, pas dix.
    assert len(_sent(dav, "evening")) == 4
    assert webpush.count == 4

    asyncio.run(EveningService(store).done(at(19, 10)))
    for minute in range(10, 30):
        _tick(store, push_sender, at(19, minute))
    assert len(_sent(dav, "evening")) == 4


def test_ca06_snoozed_thirty_minutes_then_it_resumes(
    store: FileStore, push_sender: PushSender, dav: FakeWebDav
) -> None:
    _seed(dav)
    _tick(store, push_sender, at(19))
    asyncio.run(EveningService(store).snooze(at(19, 1)))

    for minute in range(2, 31):
        _tick(store, push_sender, at(19, minute))
    assert len(_sent(dav, "evening")) == 1

    _tick(store, push_sender, at(19, 31))
    assert len(_sent(dav, "evening")) == 2


def test_relances_do_not_consume_the_reminders_budget(
    store: FileStore, push_sender: PushSender, dav: FakeWebDav
) -> None:
    """D1 : onze relances, et le rappel de 21 h part quand même."""
    _seed(dav, "reminders_meals,21:00\n")
    for minute in range(0, 120, 3):
        _tick(store, push_sender, at(19) + timedelta(minutes=minute))
    _tick(store, push_sender, at(21, 1))

    assert len(_sent(dav, "evening")) >= 11
    assert len(_sent(dav, "meals")) == 1


def test_the_evening_point_can_be_switched_off(
    store: FileStore, push_sender: PushSender, dav: FakeWebDav, webpush: FakeWebPush
) -> None:
    _seed(dav, "evening_enabled,false\n")
    _tick(store, push_sender, at(19))
    assert webpush.count == 0


def test_ca06_a_critical_alert_crosses_quiet_hours_once(
    store: FileStore, push_sender: PushSender, dav: FakeWebDav, webpush: FakeWebPush
) -> None:
    _seed(dav, "quiet_start,22:00\nquiet_end,07:00\nreminders_meals,23:00\n")
    dav.seed(
        PAIN,
        "pain_id,date,report,zone,side,intensity,baseline,moment,kind,limp,run_id,note,source\n"
        f"g1,{JOUR - timedelta(days=1)},pain,Genou,left,7,0,during,sharp,false,,,import\n",
    )

    _tick(store, push_sender, at(23))
    _tick(store, push_sender, at(23, 30))

    alerts = _sent(dav, "alert")
    assert len(alerts) == 1
    assert "pain-stop:g1:" in alerts[0]
    # Ni relance ni rappel pendant les heures calmes : seule l'alerte est partie.
    assert _sent(dav, "evening") == []
    assert _sent(dav, "meals") == []
    assert webpush.count == 1


# ── La feuille du soir, par les routes ────────────────


@pytest.fixture
def evening_at(monkeypatch: pytest.MonkeyPatch) -> Any:
    routes = importlib.import_module("app.domains.evening.router")

    def set_clock(hour: int, minute: int = 0) -> datetime:
        moment = datetime.combine(TODAY, time(hour, minute), tzinfo=tz())
        monkeypatch.setattr(routes, "now_local", lambda: moment)
        return moment

    return set_clock


def test_the_evening_sheet_lists_what_to_rate_and_asks_the_pain_once(
    store_client: TestClient, auth: dict[str, str], evening_at: Any
) -> None:
    evening_at(20)
    store_client.post(
        "/api/activity/runs",
        json={"date": TODAY.isoformat(), "duration_min": 52, "distance_km": 8.2},
        headers=auth,
    )

    flow = store_client.get("/api/evening", headers=auth).json()
    assert flow["due"] is True
    assert flow["summary"] == "Aujourd'hui : course 52 min."
    assert [item["label"] for item in flow["debrief"]] == ["Course"]
    assert flow["debrief"][0]["detail"] == "52 min · 8,2 km"
    question = flow["pain"]
    assert question["label"] == "Course"

    store_client.post(
        "/api/pain/none",
        json={"date": TODAY.isoformat(), "run_id": question["activity_id"]},
        headers=auth,
    )
    assert store_client.get("/api/evening", headers=auth).json()["pain"] is None

    done = store_client.post("/api/evening/done", headers=auth).json()
    assert done["done"] is True and done["due"] is False


def test_without_any_session_the_summary_says_only_what_is_noted(
    store_client: TestClient, auth: dict[str, str], evening_at: Any
) -> None:
    evening_at(20)
    flow = store_client.get("/api/evening", headers=auth).json()
    assert flow["summary"] == "Aucune séance notée aujourd'hui."
    assert flow["pain"] is None


def test_snoozing_silences_the_sheet_until_its_deadline(
    store_client: TestClient, auth: dict[str, str], evening_at: Any
) -> None:
    evening_at(20)
    snoozed = store_client.post("/api/evening/snooze", json={}, headers=auth).json()
    assert snoozed["due"] is False
    assert snoozed["snoozed_until"].startswith(f"{TODAY.isoformat()}T20:30")

    evening_at(20, 31)
    assert store_client.get("/api/evening", headers=auth).json()["due"] is True


def test_the_notification_link_snoozes_only_with_todays_signature(
    store_client: TestClient, evening_at: Any, settings: Any
) -> None:
    """La route publique (D6) : sans jeton de session, mais sous signature du jour."""
    evening_at(20)
    good = signature(settings.jwt_secret, TODAY)
    yesterday = signature(settings.jwt_secret, TODAY - timedelta(days=1))

    assert (
        store_client.post(f"/api/public/evening/snooze?day={TODAY}&sig={'0' * 32}").status_code
        == 404
    )
    assert (
        store_client.post(
            f"/api/public/evening/snooze?day={TODAY - timedelta(days=1)}&sig={yesterday}"
        ).status_code
        == 404
    )
    assert (
        store_client.post(f"/api/public/evening/snooze?day={TODAY}&sig={good}").status_code == 204
    )


def test_escalation_settings_are_read_and_written_under_if_match(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    view = store_client.get("/api/notifications", headers=auth).json()
    assert view["escalation"] == {
        "enabled": True,
        "start": "19:00",
        "end": None,
        "interval_min": 3,
        "snooze_min": 30,
        "cap": 100,
        "quiet_start": "00:00",
        "quiet_end": "07:00",
    }

    refused = store_client.patch(
        "/api/notifications/escalation", json={"interval_min": 5}, headers=auth
    )
    assert refused.status_code == 409

    updated = store_client.patch(
        "/api/notifications/escalation",
        json={"interval_min": 5, "enabled": False, "quiet_start": "23:00"},
        headers={**auth, "If-Match": view["token"]},
    ).json()
    assert updated["escalation"]["interval_min"] == 5
    assert updated["escalation"]["enabled"] is False
    assert updated["escalation"]["quiet_start"] == "23:00"


def test_a_pain_back_in_the_same_place_is_an_alert(
    store_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    earlier = TODAY - timedelta(days=20)
    dav.seed(
        PAIN,
        "pain_id,date,report,zone,side,intensity,baseline,moment,kind,limp,run_id,note,source\n"
        f"a1,{earlier},pain,Achille,right,3,0,after,dull,false,,,import\n"
        f"a1,{earlier + timedelta(days=2)},pain,Achille,right,0,,next_day,dull,false,,,morning\n"
        f"a2,{TODAY},pain,achille,right,3,0,after,dull,false,,,import\n",
    )

    alerts = store_client.get("/api/notifications/alerts", headers=auth).json()
    back = [item for item in alerts if item["key"] == "pain-back:a2"]
    assert back and back[0]["priority"] == "critical"
    assert "revient" in back[0]["body"]
