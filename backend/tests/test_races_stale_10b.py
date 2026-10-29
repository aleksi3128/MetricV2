"""Le plan d'une course passée en B, ou retirée (session 10 b, `docs/pages/modifications.md` §7).

M-17 ne visait que la date : une course A passée en B gardait son plan sans rien dire, une
course retirée laissait ses séances `plan` au planning. Le serveur le dit désormais, comme
pour la date, et dit **avant l'appui** ce qui partirait.
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.core.dates import week_start
from app.core.validation import today_local
from app.domains.planning.schemas import PlanPayload
from app.domains.planning.service import PlanningService
from app.domains.races import periodize
from app.domains.races.schemas import RacePayload
from app.domains.races.service import RaceService
from app.storage.files import FileStore

TODAY = today_local()
#: Un mardi de la semaine prochaine : la pose y écrit des séances, et le banc lit le plan
#: trois semaines plus tard, quand une partie est passée.
PLACED_ON = week_start(TODAY) + timedelta(weeks=1, days=1)
LATER = PLACED_ON + timedelta(weeks=3)


def _race(store: FileStore, name: str, day: date, priority: str = "A") -> str:
    view = asyncio.run(
        RaceService(store).create(
            RacePayload.model_validate(
                {"name": name, "date": day.isoformat(), "distance": "semi", "priority": priority}
            )
        )
    )
    return next(race.race_id for race in view.races if race.name == name)


def _correct(store: FileStore, name: str, **changes: Any) -> None:
    service = RaceService(store)
    race = next(item for item in asyncio.run(service.view()).races if item.name == name)
    body = {
        "name": race.name,
        "date": race.date.isoformat(),
        "distance": race.distance,
        "priority": race.priority,
        **changes,
    }
    asyncio.run(service.update(race.id, race.token, RacePayload.model_validate(body)))


def _counts(store: FileStore, day: date) -> tuple[int, int]:
    """Les séances `plan` passées et à venir, vues d'un jour donné."""
    placed = asyncio.run(PlanningService(store).placed_plan())
    past = sum(1 for session in placed if session.date is not None and session.date < day)
    return past, sum(1 for session in placed if session.date is not None and session.date >= day)


def test_an_a_race_moved_to_b_says_its_plan_no_longer_follows(store: FileStore) -> None:
    _race(store, "Semi de Lyon", PLACED_ON + timedelta(weeks=12))
    service = RaceService(store)
    race_id = asyncio.run(service.view()).next_a
    assert race_id is not None
    asyncio.run(service.place(race_id, PLACED_ON))
    assert asyncio.run(service.view(LATER)).stale_plan is None

    _correct(store, "Semi de Lyon", priority="B")

    stale = asyncio.run(service.view(LATER)).stale_plan
    past, coming = _counts(store, LATER)
    assert stale is not None
    assert (stale.reason, stale.race_id, stale.repose, stale.clear) == (
        "priority",
        race_id,
        race_id,
        True,
    )
    assert stale.leaving == coming
    assert "Semi de Lyon est en priorité B" in stale.text
    assert "le refait pour Semi de Lyon, en B" in stale.text
    assert f"{coming} séances à venir partent ; les {past} passées restent." in stale.text


def test_with_another_a_race_the_repose_prepares_that_one(store: FileStore) -> None:
    _race(store, "Semi de Lyon", PLACED_ON + timedelta(weeks=12))
    service = RaceService(store)
    lyon = asyncio.run(service.view()).next_a
    assert lyon is not None
    asyncio.run(service.place(lyon, PLACED_ON))
    marathon = _race(store, "Marathon de Paris", PLACED_ON + timedelta(weeks=24))

    _correct(store, "Semi de Lyon", priority="B")

    stale = asyncio.run(service.view(LATER)).stale_plan
    assert stale is not None and stale.repose == marathon
    assert "le refait pour Marathon de Paris, la course A" in stale.text
    # Reposer pose le plan de la course A, et l'avis s'efface.
    asyncio.run(service.place(marathon, LATER))
    assert asyncio.run(service.view(LATER)).stale_plan is None


def test_a_removed_race_leaves_an_orphan_plan_that_the_server_names(store: FileStore) -> None:
    _race(store, "Semi de Lyon", PLACED_ON + timedelta(weeks=12))
    service = RaceService(store)
    race_id = asyncio.run(service.view()).next_a
    assert race_id is not None
    asyncio.run(service.place(race_id, PLACED_ON))
    race = asyncio.run(service.view()).races[0]

    asyncio.run(service.delete(race.id, race.token))

    view = asyncio.run(service.view(LATER))
    stale = view.stale_plan
    past, coming = _counts(store, LATER)
    assert view.races == []
    assert stale is not None
    assert (stale.reason, stale.race_id, stale.repose, stale.clear) == ("removed", None, None, True)
    assert stale.title == "Un plan sans course"
    assert "Le plan posé pour Semi de Lyon reste au planning" in stale.text
    assert f"{coming} séances à venir partent ; les {past} passées restent." in stale.text

    cleared = asyncio.run(service.clear(LATER))
    assert cleared.removed == coming
    assert _counts(store, LATER) == (past, 0)
    assert asyncio.run(service.view(LATER)).stale_plan is None


def test_a_session_touched_by_hand_leaves_too_and_is_counted(store: FileStore) -> None:
    _race(store, "Semi de Lyon", PLACED_ON + timedelta(weeks=12))
    service = RaceService(store)
    race_id = asyncio.run(service.view()).next_a
    assert race_id is not None
    asyncio.run(service.place(race_id, PLACED_ON))
    planning = PlanningService(store)
    target = next(
        session
        for session in asyncio.run(planning.between(LATER, LATER + timedelta(weeks=2)))
        if not (session.note or "").startswith("Course :")
    )
    asyncio.run(
        planning.update(
            target.id,
            target.token,
            PlanPayload(
                date=target.date,
                kind="course",
                title=target.title,
                duration_min=target.duration_min,
                note="ma note à moi",
            ),
        )
    )
    race = asyncio.run(service.view()).races[0]
    asyncio.run(service.delete(race.id, race.token))

    stale = asyncio.run(service.view(LATER)).stale_plan
    assert stale is not None and ", dont 1 retouchée à la main ;" in stale.text
    _, coming = _counts(store, LATER)
    assert asyncio.run(service.clear(LATER)).removed == coming


def test_a_session_of_the_day_already_done_stays(
    store_client: TestClient, store: FileStore, auth: dict[str, str]
) -> None:
    """Faite, la séance du jour est du passé : ni le retrait, ni la repose ne l'emportent."""
    planning = PlanningService(store)
    note = periodize.placed_note("8 km EF", "Semi de Lyon", 1, 12, "base")
    asyncio.run(
        planning.place_plan(
            [
                PlanPayload(date=day, kind="course", title="Footing", duration_min=45, note=note)
                for day in (TODAY, TODAY + timedelta(days=2))
            ]
        )
    )
    run = store_client.post(
        "/api/activity/runs",
        json={"date": TODAY.isoformat(), "distance_km": "8", "duration_min": "48:00"},
        headers=auth,
    )
    assert run.status_code == 201

    view = store_client.get("/api/races", headers=auth).json()
    stale = view["stale_plan"]
    assert stale["reason"] == "removed"
    assert stale["leaving"] == 1
    assert "1 séance à venir part ; celle d'aujourd'hui, déjà faite, reste." in stale["text"]

    cleared = store_client.delete("/api/races/plan", headers=auth).json()
    assert cleared["removed"] == 1
    assert [session.date for session in asyncio.run(planning.placed_plan())] == [TODAY]
    assert store_client.get("/api/races", headers=auth).json()["stale_plan"] is None


def test_the_dashboard_says_it_apart_from_the_a_race_and_offers_no_gesture(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    """L'accueil suit la même information ; reposer et retirer n'ont qu'une adresse."""
    first = store_client.post(
        "/api/races",
        json={
            "name": "Semi de Lyon",
            "date": (TODAY + timedelta(weeks=10)).isoformat(),
            "distance": "semi",
            "priority": "A",
        },
        headers=auth,
    ).json()
    race_id = first["next_a"]
    assert store_client.post(f"/api/races/plan/{race_id}", headers=auth).status_code == 200
    # Relue : la pose écrit `plan_date`, donc un nouveau jeton.
    race = store_client.get("/api/races", headers=auth).json()["races"][0]
    patched = store_client.patch(
        f"/api/races/{race['id']}",
        json={
            "name": race["name"],
            "date": race["date"],
            "distance": race["distance"],
            "priority": "B",
        },
        headers={**auth, "If-Match": race["token"]},
    )
    assert patched.status_code == 200, patched.text

    body = store_client.get("/api/aggregates/dashboard", headers=auth).json()

    assert body["race"] is None, "plus aucune course A"
    notice = body["plan_notice"]
    assert notice["reason"] == "priority"
    assert (
        notice["text"] == store_client.get("/api/races", headers=auth).json()["stale_plan"]["text"]
    )


def test_a_moved_a_race_keeps_its_notice_on_the_a_race_not_apart(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    """La date (M-17) reste sur la course A elle-même : pas de second avis."""
    first = store_client.post(
        "/api/races",
        json={
            "name": "Semi",
            "date": (TODAY + timedelta(weeks=10)).isoformat(),
            "distance": "semi",
            "priority": "A",
        },
        headers=auth,
    ).json()
    store_client.post(f"/api/races/plan/{first['next_a']}", headers=auth)
    race = store_client.get("/api/races", headers=auth).json()["races"][0]
    store_client.patch(
        f"/api/races/{race['id']}",
        json={
            "name": race["name"],
            "date": (TODAY + timedelta(weeks=12)).isoformat(),
            "distance": race["distance"],
            "priority": "A",
        },
        headers={**auth, "If-Match": race["token"]},
    )

    body = store_client.get("/api/aggregates/dashboard", headers=auth).json()

    assert body["race"]["plan"] == "stale"
    assert body["race"]["stale_plan"]["reason"] == "date"
    assert body["plan_notice"] is None
