"""Les courses visées et leur plan (`docs/plan-course.md`).

CA-05 : une course A le 18/10 — la semaine d'avant est un affûtage, une séance à l'allure
de course, repos à J-1 ou J-2. CA-07 : un marathon et un Ironman en A la même saison — le
coach tranche, argumente, et ne change rien sans un oui.
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from itertools import pairwise
from typing import Any

from fastapi.testclient import TestClient

from app.core.dates import week_start
from app.core.validation import today_local
from app.domains.races import conflicts, periodize
from app.domains.races.catalog import SPECS
from app.domains.races.models import RaceRow
from app.domains.races.schemas import RacePayload
from app.domains.races.service import RaceService
from app.storage.csv_repo import CsvRepository
from app.storage.files import FileStore
from app.storage.paths import RACES

TODAY = today_local()


def ten_k(today: date = date(2026, 8, 20), weekly: float | None = 18) -> periodize.Plan:
    return periodize.build(
        today,
        date(2026, 10, 18),
        "10 km de Toulouse",
        "A",
        SPECS["10k"],
        weekly_km=weekly,
        longest_km=9,
        easy_pace=6.2,
    )


# ── Le plan ───────────────────────────────────────────


def test_ca05_the_race_week_is_a_taper_with_race_pace_and_rest_before() -> None:
    plan = ten_k()
    race_week = plan.weeks[-1]
    peak = max(week.km for week in plan.weeks[:-1])

    assert race_week.phase == "course"
    # Volume réduit de 40 à 60 % (Bosquet 2007).
    assert 0.4 * peak <= race_week.km <= 0.6 * peak
    # Une séance à l'allure de course.
    assert any("AS10" in session.notation for session in race_week.sessions if not session.race)
    # Repos à J-1 et J-2.
    days = {session.day for session in race_week.sessions}
    assert date(2026, 10, 17) not in days and date(2026, 10, 16) not in days
    assert [session.race for session in race_week.sessions][-1] is True


def test_the_week_before_the_race_week_is_already_lighter() -> None:
    plan = ten_k()
    assert plan.weeks[-2].phase == "affûtage"
    assert plan.weeks[-2].km < max(week.km for week in plan.weeks[:-2])


def test_volume_never_grows_more_than_8_percent_a_week() -> None:
    plan = ten_k(weekly=18)
    building = [
        week for week in plan.weeks if week.phase in ("base", "développement", "spécifique")
    ]
    for previous, current in pairwise(building):
        assert current.km <= round(previous.km * periodize.GROWTH, 1) + 0.1


def test_every_fourth_week_is_a_recovery_week() -> None:
    plan = periodize.build(
        date(2026, 1, 5),
        date(2026, 6, 14),
        "Marathon",
        "A",
        SPECS["marathon"],
        weekly_km=30,
        longest_km=15,
        easy_pace=6,
    )
    phases = [week.phase for week in plan.weeks]
    assert phases[3] == "récupération"
    assert phases[7] == "récupération"
    assert phases[0] == "base" and "spécifique" in phases


def test_never_two_running_days_in_a_row() -> None:
    for week in ten_k().weeks:
        days = sorted(session.day for session in week.sessions)
        assert all((b - a).days >= 2 for a, b in pairwise(days))


def test_a_short_preparation_is_said_not_forced() -> None:
    plan = periodize.build(
        date(2026, 9, 1),
        date(2026, 10, 18),
        "Marathon",
        "A",
        SPECS["marathon"],
        weekly_km=20,
        longest_km=10,
        easy_pace=6,
    )
    assert any("Préparation courte" in warning for warning in plan.warnings)
    building = [week for week in plan.weeks if week.phase not in ("affûtage", "course")]
    assert max(week.km for week in building) < SPECS["marathon"].peak_km


def test_without_history_the_plan_starts_from_the_floor_and_says_so() -> None:
    plan = ten_k(weekly=None)
    assert plan.warnings[0].startswith("Aucune sortie sur les 4 dernières semaines")


def test_sessions_are_written_in_the_coach_notation() -> None:
    notations = [session.notation for week in ten_k().weeks for session in week.sessions]
    assert any(" T r2' + 10' RC" in item for item in notations)
    assert any(item.endswith(" km SL") for item in notations)
    assert any("× 80 m LD" in item for item in notations)


# ── Les conflits (CA-07) ──────────────────────────────


def test_ca07_the_most_demanding_race_stays_a_and_the_reason_is_given() -> None:
    races = [
        conflicts.Race("m1", "Marathon de Paris", date(2027, 4, 11), "marathon", "A"),
        conflicts.Race("i1", "Ironman de Nice", date(2027, 6, 27), "ironman", "A"),
    ]
    found = conflicts.find(races, {})

    assert len(found) == 1
    conflict = found[0]
    assert conflict.keep == "i1" and conflict.demote == "m1"
    assert "je passe Marathon de Paris en B" in conflict.text
    assert "à 11 semaines d'écart" in conflict.text
    assert "Bosquet" in conflict.text


def test_far_enough_apart_there_is_no_conflict() -> None:
    races = [
        conflicts.Race("a", "10 km", date(2027, 3, 1), "10k", "A"),
        conflicts.Race("b", "Semi", date(2027, 5, 1), "semi", "A"),
    ]
    assert conflicts.find(races, {}) == []


# ── Par les routes ────────────────────────────────────


def _race(client: TestClient, auth: dict[str, str], **body: Any) -> dict[str, Any]:
    response = client.post("/api/races", json=body, headers=auth)
    assert response.status_code == 201, response.text
    return dict(response.json())


def test_ca07_nothing_changes_without_a_yes(store_client: TestClient, auth: dict[str, str]) -> None:
    marathon = TODAY + timedelta(weeks=20)
    _race(
        store_client,
        auth,
        name="Marathon",
        date=marathon.isoformat(),
        distance="marathon",
        priority="A",
    )
    view = _race(
        store_client,
        auth,
        name="Ironman",
        date=(marathon + timedelta(weeks=10)).isoformat(),
        distance="ironman",
        priority="A",
    )

    conflict = view["conflicts"][0]
    assert [race["priority"] for race in view["races"]] == ["A", "A"]

    accepted = store_client.post(
        f"/api/races/conflicts/{conflict['key']}", json={"accept": True}, headers=auth
    ).json()
    assert {race["name"]: race["priority"] for race in accepted["races"]} == {
        "Marathon": "B",
        "Ironman": "A",
    }
    assert accepted["conflicts"] == []
    assert accepted["next_a"] == next(
        r["race_id"] for r in accepted["races"] if r["name"] == "Ironman"
    )


def test_a_refused_proposal_is_not_asked_again(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    day = TODAY + timedelta(weeks=12)
    _race(store_client, auth, name="Semi", date=day.isoformat(), distance="semi", priority="A")
    view = _race(
        store_client,
        auth,
        name="Marathon",
        date=(day + timedelta(weeks=4)).isoformat(),
        distance="marathon",
        priority="A",
    )
    key = view["conflicts"][0]["key"]

    refused = store_client.post(
        f"/api/races/conflicts/{key}", json={"accept": False}, headers=auth
    ).json()
    assert refused["conflicts"] == []
    assert [race["priority"] for race in refused["races"]] == ["A", "A"]


def test_a_plan_is_placed_replaced_and_cleared(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    view = _race(
        store_client,
        auth,
        name="10 km",
        date=(TODAY + timedelta(weeks=8)).isoformat(),
        distance="10k",
        priority="A",
    )
    race_id = view["next_a"]

    plan = store_client.get(f"/api/races/plan/{race_id}", headers=auth).json()
    assert plan["weeks"][-1]["phase"] == "course"
    assert plan["placed"] == 0

    first = store_client.post(f"/api/races/plan/{race_id}", headers=auth).json()
    assert first["created"] > 0 and first["removed"] == 0
    again = store_client.post(f"/api/races/plan/{race_id}", headers=auth).json()
    assert again["removed"] == first["created"]

    month = (TODAY + timedelta(weeks=8)).strftime("%Y-%m")
    planned = store_client.get(f"/api/planning/month?month={month}", headers=auth).json()
    sessions = [item for day in planned["days"] for item in day["planned"]]
    race_day = [item for item in sessions if item["title"] == "10 km"]
    assert race_day and race_day[0]["source"] == "plan"
    assert "Course : 10 km — priorité A" in race_day[0]["note"]

    cleared = store_client.delete("/api/races/plan", headers=auth).json()
    assert cleared["removed"] == again["created"]


def test_a_race_is_corrected_and_removed_under_if_match(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    view = _race(
        store_client,
        auth,
        name="5 km",
        date=(TODAY + timedelta(weeks=6)).isoformat(),
        distance="5k",
        priority="B",
        target="0:25:00",
    )
    race = view["races"][0]
    assert race["countdown"] == "dans 6 semaines"

    assert store_client.delete(f"/api/races/{race['id']}", headers=auth).status_code == 409
    gone = store_client.delete(
        f"/api/races/{race['id']}", headers={**auth, "If-Match": race["token"]}
    ).json()
    assert gone["races"] == []


def _patch(
    client: TestClient, auth: dict[str, str], race: dict[str, Any], **changes: Any
) -> dict[str, Any]:
    body = {key: race[key] for key in ("name", "date", "distance", "priority", "target", "note")}
    response = client.patch(
        f"/api/races/{race['id']}",
        json={**body, **changes},
        headers={**auth, "If-Match": race["token"]},
    )
    assert response.status_code == 200, response.text
    return dict(response.json())


def test_m17_a_race_is_corrected_in_place_under_if_match(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    view = _race(
        store_client,
        auth,
        name="10 km",
        date=(TODAY + timedelta(weeks=6)).isoformat(),
        distance="10k",
        priority="B",
    )
    race = view["races"][0]
    body = {"name": "10 km", "date": race["date"], "distance": "10k", "priority": "B"}

    missing = store_client.patch(f"/api/races/{race['id']}", json=body, headers=auth)
    assert missing.status_code == 409

    fixed = _patch(store_client, auth, race, name="10 km de Toulouse", target="0:52:00")
    assert fixed["races"][0]["name"] == "10 km de Toulouse"
    assert fixed["races"][0]["target"] == "0:52:00"
    assert fixed["races"][0]["race_id"] == race["race_id"]
    assert fixed["stale_plan"] is None

    stale = store_client.patch(
        f"/api/races/{race['id']}", json=body, headers={**auth, "If-Match": race["token"]}
    )
    assert stale.status_code == 409


def test_m17_a_priority_corrected_to_a_reopens_the_conflict(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    day = TODAY + timedelta(weeks=12)
    _race(store_client, auth, name="Semi", date=day.isoformat(), distance="semi", priority="A")
    view = _race(
        store_client,
        auth,
        name="Marathon",
        date=(day + timedelta(weeks=4)).isoformat(),
        distance="marathon",
        priority="B",
    )
    assert view["conflicts"] == []

    marathon = next(race for race in view["races"] if race["name"] == "Marathon")
    corrected = _patch(store_client, auth, marathon, priority="A")
    assert len(corrected["conflicts"]) == 1


def test_m17_a_placed_plan_no_longer_follows_a_moved_race_until_placed_again(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    first_day = TODAY + timedelta(weeks=10)
    view = _race(
        store_client,
        auth,
        name="Semi de Lyon",
        date=first_day.isoformat(),
        distance="semi",
        priority="A",
    )
    race_id = view["next_a"]
    store_client.post(f"/api/races/plan/{race_id}", headers=auth)
    race = store_client.get("/api/races", headers=auth).json()["races"][0]

    # Le nom ne défait pas le plan : seule la date déplace des séances.
    renamed = _patch(store_client, auth, race, name="Semi de Lyon 2027")
    assert renamed["stale_plan"] is None

    moved_day = first_day + timedelta(weeks=2)
    moved = _patch(store_client, auth, renamed["races"][0], date=moved_day.isoformat())
    assert moved["stale_plan"]["race_id"] == race_id
    assert f"mène au {first_day:%d/%m}" in moved["stale_plan"]["text"]
    assert f"maintenant le {moved_day:%d/%m}" in moved["stale_plan"]["text"]

    store_client.post(f"/api/races/plan/{race_id}", headers=auth)
    assert store_client.get("/api/races", headers=auth).json()["stale_plan"] is None


def test_m17_a_moved_race_without_a_placed_plan_says_nothing(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    view = _race(
        store_client,
        auth,
        name="10 km",
        date=(TODAY + timedelta(weeks=8)).isoformat(),
        distance="10k",
        priority="A",
    )
    moved = _patch(
        store_client,
        auth,
        view["races"][0],
        date=(TODAY + timedelta(weeks=9)).isoformat(),
    )
    assert moved["stale_plan"] is None

    # Posé puis retiré : plus rien à venir, plus rien à dire.
    race_id = moved["next_a"]
    store_client.post(f"/api/races/plan/{race_id}", headers=auth)
    store_client.delete("/api/races/plan", headers=auth)
    again = store_client.get("/api/races", headers=auth).json()["races"][0]
    assert (
        _patch(store_client, auth, again, date=(TODAY + timedelta(weeks=10)).isoformat())[
            "stale_plan"
        ]
        is None
    )


def test_m17_a_plan_placed_before_the_column_is_recognised_by_its_race_day(
    store_client: TestClient, store: FileStore, auth: dict[str, str]
) -> None:
    """Un plan posé avant `plan_date` : le jour de course posé dit à quelle course il va."""
    first_day = TODAY + timedelta(weeks=8)
    view = _race(
        store_client,
        auth,
        name="10 km",
        date=first_day.isoformat(),
        distance="10k",
        priority="A",
    )
    race_id = view["next_a"]
    store_client.post(f"/api/races/plan/{race_id}", headers=auth)
    # L'état d'avant M-17 : des séances posées, aucune trace sur la course.
    repo: CsvRepository[RaceRow] = CsvRepository(store, RACES, RaceRow)
    asyncio.run(
        repo.update_where(
            lambda race: True, lambda race: race.model_copy(update={"plan_date": None})
        )
    )

    race = store_client.get("/api/races", headers=auth).json()["races"][0]
    moved = _patch(store_client, auth, race, date=(first_day + timedelta(days=7)).isoformat())
    assert moved["stale_plan"]["race_id"] == race_id


def test_a_peak_out_of_reach_is_said_with_its_reason() -> None:
    plan = periodize.build(
        date(2026, 10, 20),
        date(2027, 4, 11),
        "Marathon de Paris",
        "A",
        SPECS["marathon"],
        weekly_km=10.5,
        longest_km=7,
        easy_pace=6.2,
    )
    warning = next(item for item in plan.warnings if item.startswith("Le pic visé"))
    assert "65 km" in warning and "Nielsen" in warning


# ── La course A dans « Où je vais » (M-19) ────────────
#
# Le jour est donné au service, pas pris à l'horloge : la phase dépend de la semaine où
# l'on est dans le plan posé, et le décompte du jour J et du lendemain se vérifient à date
# fixe. Les dates restent à venir pour passer la validation des courses.

#: Un mardi : le plan posé ce jour-là commence le lundi qui suit.
PLACED_ON = week_start(TODAY) + timedelta(weeks=1, days=1)


def _service_race(
    store: FileStore, name: str, day: date, priority: str = "A", distance: str = "semi"
) -> str:
    view = asyncio.run(
        RaceService(store).create(
            RacePayload.model_validate(
                {"name": name, "date": day.isoformat(), "distance": distance, "priority": priority}
            )
        )
    )
    return next(race.race_id for race in view.races if race.name == name)


def test_m19_the_placed_note_reads_back_what_place_writes() -> None:
    note = periodize.placed_note("8 km EF + 6 × 80 m LD", "Semi, de Lyon", 3, 16, "base")
    assert periodize.read_placed_note(note) == periodize.Placed(3, 16, "base")
    assert periodize.read_placed_note("40' EF — ma note à moi") is None
    assert periodize.read_placed_note("x — plan y, semaine 2/9, inconnue.") is None


def test_m19_no_a_race_is_no_aim(store: FileStore) -> None:
    _service_race(store, "Trail", TODAY + timedelta(weeks=8), priority="B")
    assert asyncio.run(RaceService(store).aim(TODAY)) is None


def test_m19_an_a_race_without_a_plan_has_no_phase(store: FileStore) -> None:
    _service_race(store, "Trail", TODAY + timedelta(weeks=3), priority="B")
    _service_race(store, "Semi de Lyon", TODAY + timedelta(weeks=8))

    aim = asyncio.run(RaceService(store).aim(TODAY))

    assert aim is not None
    assert aim.race.name == "Semi de Lyon"
    assert aim.countdown == "J-56"
    assert aim.plan == "absent"
    assert aim.phase is None and aim.phase_text is None and aim.stale_plan is None


def test_m19_the_phase_is_the_placed_one_not_the_recomputed_one(store: FileStore) -> None:
    """Recalculé chaque jour, le plan commence toujours par sa base ; posé, il avance."""
    race_day = PLACED_ON + timedelta(weeks=16)
    race_id = _service_race(store, "Semi de Lyon", race_day)
    service = RaceService(store)
    asyncio.run(service.place(race_id, PLACED_ON))
    weeks = periodize.build(
        PLACED_ON,
        race_day,
        "Semi de Lyon",
        "A",
        SPECS["semi"],
        weekly_km=None,
        longest_km=None,
        easy_pace=None,
    ).weeks

    # Le jour où l'on pose : la semaine en cours n'a rien, le plan commence lundi.
    placing = asyncio.run(service.aim(PLACED_ON))
    assert placing is not None and placing.plan == "posed"
    assert placing.phase == weeks[0].phase
    assert placing.phase_text == (
        f"Semaine 1 sur {len(weeks)} — {periodize.PHASE_WORDS[weeks[0].phase]}, "
        f"à partir du {weeks[0].start:%d/%m}"
    )

    # Dix semaines plus tard, un jeudi : la semaine en cours a ses séances.
    later = weeks[9].start + timedelta(days=3)
    mid = asyncio.run(service.aim(later))
    assert mid is not None
    assert mid.phase == weeks[9].phase
    assert mid.phase_text == (
        f"Semaine 10 sur {len(weeks)} — {periodize.PHASE_WORDS[weeks[9].phase]}"
    )
    # Le plan recalculé ce jeudi-là repartirait de sa base : ce n'est pas celui qu'on suit.
    assert mid.phase == "développement"
    assert asyncio.run(service.plan(race_id, later)).weeks[0].phase == "base"


def test_m19_race_day_then_the_day_after(store: FileStore) -> None:
    race_day = PLACED_ON + timedelta(weeks=6)
    race_id = _service_race(store, "10 km", race_day, distance="10k")
    service = RaceService(store)
    asyncio.run(service.place(race_id, PLACED_ON))

    on_the_day = asyncio.run(service.aim(race_day))
    assert on_the_day is not None
    assert on_the_day.countdown == "Jour J"
    assert on_the_day.phase == "course"
    assert on_the_day.phase_text is not None and on_the_day.phase_text.endswith("la course")

    # Le lendemain, la course est passée : « Où je vais » ne la montre plus.
    assert asyncio.run(service.aim(race_day + timedelta(days=1))) is None


def test_m19_the_next_a_follows_once_the_first_is_run(store: FileStore) -> None:
    first = PLACED_ON + timedelta(weeks=4)
    _service_race(store, "10 km", first, distance="10k")
    _service_race(store, "Marathon", first + timedelta(weeks=20), distance="marathon")

    after = asyncio.run(RaceService(store).aim(first + timedelta(days=1)))
    assert after is not None and after.race.name == "Marathon"


def test_m19_a_plan_that_no_longer_follows_shows_no_phase(
    store_client: TestClient, store: FileStore, auth: dict[str, str]
) -> None:
    first_day = TODAY + timedelta(weeks=10)
    view = _race(
        store_client, auth, name="Semi", date=first_day.isoformat(), distance="semi", priority="A"
    )
    store_client.post(f"/api/races/plan/{view['next_a']}", headers=auth)
    race = store_client.get("/api/races", headers=auth).json()["races"][0]
    _patch(store_client, auth, race, date=(first_day + timedelta(weeks=2)).isoformat())

    aim = asyncio.run(RaceService(store).aim(TODAY))

    assert aim is not None and aim.plan == "stale"
    assert aim.phase is None and aim.phase_text is None
    assert aim.stale_plan is not None and "ne suit plus" in aim.stale_plan.text


def test_m19_a_plan_placed_for_another_race_is_not_this_ones(store: FileStore) -> None:
    """La course B a son plan posé ; la course A n'en a aucun, et l'accueil le dit."""
    b_id = _service_race(store, "Trail", PLACED_ON + timedelta(weeks=6), priority="B")
    _service_race(store, "Semi", PLACED_ON + timedelta(weeks=14))
    service = RaceService(store)
    asyncio.run(service.place(b_id, PLACED_ON))

    aim = asyncio.run(service.aim(PLACED_ON))
    assert aim is not None and aim.race.name == "Semi" and aim.plan == "absent"


def test_m19_a_plan_placed_before_the_column_still_has_its_phase(store: FileStore) -> None:
    race_id = _service_race(store, "Semi", PLACED_ON + timedelta(weeks=12))
    service = RaceService(store)
    asyncio.run(service.place(race_id, PLACED_ON))
    repo: CsvRepository[RaceRow] = CsvRepository(store, RACES, RaceRow)
    asyncio.run(
        repo.update_where(
            lambda race: True, lambda race: race.model_copy(update={"plan_date": None})
        )
    )

    aim = asyncio.run(service.aim(PLACED_ON))
    assert aim is not None and aim.plan == "posed" and aim.phase is not None


def test_m19_the_dashboard_carries_the_a_race(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    _race(
        store_client,
        auth,
        name="Semi de Lyon",
        date=(TODAY + timedelta(weeks=8)).isoformat(),
        distance="semi",
        priority="A",
    )
    race = store_client.get("/api/aggregates/dashboard", headers=auth).json()["race"]
    assert race["race"]["name"] == "Semi de Lyon"
    assert race["countdown"] == "J-56"
    assert race["plan"] == "absent"
