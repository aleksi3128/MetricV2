"""La charge et les corrélations (`docs/coach-course.md` §6).

Deux modules purs, éprouvés sur des séries **où l'on connaît la réponse** : une charge qui
double en une semaine, une efficacité que la veille décide pour de bon — et, surtout, une
série de pur hasard, où rien ne doit s'afficher. Le plus dangereux, ici, n'est pas de rater
un effet : c'est d'en annoncer un qui n'existe pas.
"""

from __future__ import annotations

import asyncio
import random
from collections.abc import Coroutine
from datetime import date, datetime, time, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.dates import tz
from app.domains.activity import correlations, load
from app.domains.nutrition.models import MealRow
from app.storage.csv_repo import CsvRepository
from app.storage.files import FileStore
from app.storage.paths import MEALS
from app.storage.provider import StorageProvider
from tests.fit_files import GarminExtras, paced, stream_file

TODAY = date(2026, 9, 19)


def await_(work: Coroutine[Any, Any, object]) -> None:
    """Une écriture directe dans le stockage de test, depuis un test synchrone."""
    asyncio.run(work)


def easy(day: date, minutes: float = 40) -> load.Session:
    """Une sortie facile : toutes ses minutes en zone 2."""
    return load.Session(day=day, run_id=str(day), duration_min=minutes,
                        zone_seconds=(0.0, minutes * 60, 0.0, 0.0, 0.0))  # fmt: skip


def test_the_load_weights_the_minutes_by_their_zone() -> None:
    session = load.Session(
        day=TODAY, run_id="x", duration_min=35, zone_seconds=(0, 60, 60, 300, 1800)
    )
    assert session.load == 1 * 2 + 1 * 3 + 5 * 4 + 30 * 5
    assert session.hard is True


def test_without_zones_a_run_counts_in_the_zone_of_its_pace() -> None:
    session = load.Session(day=TODAY, run_id="x", duration_min=30, pace_zone=2)
    assert session.load == 60


def test_without_any_reference_a_run_has_no_load_not_zero() -> None:
    assert load.Session(day=TODAY, run_id="x", duration_min=30).load is None


def test_the_ratio_waits_for_three_weeks_of_history() -> None:
    summary = load.summarize(TODAY, [easy(TODAY - timedelta(days=offset)) for offset in (0, 3, 9)])

    assert summary.ratio is None
    assert "encore 12" in summary.ratio_text


def test_a_week_twice_the_usual_says_not_to_climb() -> None:
    usual = [easy(TODAY - timedelta(days=offset)) for offset in range(8, 29, 3)]
    week = [easy(TODAY - timedelta(days=offset), 70) for offset in range(0, 7, 2)]
    summary = load.summarize(TODAY, [*usual, *week])

    assert summary.ratio is not None
    assert summary.ratio >= load.RATIO_EASY_ONLY
    assert "on ne fait plus que du facile" in summary.ratio_text


def test_too_little_easy_running_is_said() -> None:
    hard = load.Session(day=TODAY, run_id="h", duration_min=35, zone_seconds=(0, 40, 200, 1800, 60))
    summary = load.summarize(TODAY, [hard])

    assert summary.easy_share is not None and summary.easy_share < 0.7
    assert "la prochaine sortie est facile" in summary.distribution_text
    assert summary.last_hard == TODAY


def test_the_weeks_keep_their_empty_ones() -> None:
    summary = load.summarize(TODAY, [easy(TODAY)])
    assert len(summary.weeks) == load.WEEKS_SHOWN
    assert [week.runs for week in summary.weeks][:-1] == [0] * (load.WEEKS_SHOWN - 1)


# ── Les corrélations ──────────────────────────────────


def runs(count: int) -> list[correlations.Outcome]:
    return [
        correlations.Outcome(
            day=TODAY - timedelta(days=2 * index), run_id=f"r{index}", efficiency=1.0
        )
        for index in range(count)
    ]


def factor(key: str = "calories_prev") -> correlations.Factor:
    return next(item for item in correlations.FACTORS if item.key == key)


def test_a_real_effect_is_shown_and_said_to_be_an_observation() -> None:
    """Douze sorties : les six après une grosse veille sont 8 % plus efficaces."""
    outcomes = [
        correlations.Outcome(item.day, item.run_id, 1.08 if index % 2 else 1.0)
        for index, item in enumerate(runs(12))
    ]
    contexts = [
        correlations.Context(item.run_id, {"calories_prev": 2600.0 if index % 2 else 1800.0})
        for index, item in enumerate(outcomes)
    ]
    [found] = correlations.correlate([factor()], contexts, correlations.deviations(outcomes))

    assert found.status == "shown"
    assert found.effect_pct is not None and found.effect_pct > 5
    assert "au-dessus de 2\u202f200 kcal" in found.text
    assert "Observé, pas prouvé" in found.text


def test_pure_chance_shows_nothing() -> None:
    draw = random.Random(3)
    outcomes = [
        correlations.Outcome(item.day, item.run_id, 1.0 + draw.uniform(-0.05, 0.05))
        for item in runs(14)
    ]
    contexts = [
        correlations.Context(item.run_id, {"calories_prev": draw.uniform(1500, 3000)})
        for item in outcomes
    ]
    [found] = correlations.correlate([factor()], contexts, correlations.deviations(outcomes))

    assert found.status == "none"
    assert "rien de net" in found.text


def test_before_five_runs_on_each_side_it_says_how_many_are_missing() -> None:
    outcomes = runs(6)
    contexts = [correlations.Context(item.run_id, {"strength_48h": True}) for item in outcomes]
    [found] = correlations.correlate(
        [factor("strength_48h")], contexts, correlations.deviations(outcomes)
    )

    assert found.status == "pending"
    assert "10 nécessaires, dont 5 de chaque côté" in found.text


def test_a_run_without_neighbours_has_no_reference() -> None:
    lonely = [correlations.Outcome(TODAY, "a", 1.0), correlations.Outcome(TODAY, "b", 1.1)]
    assert correlations.deviations(lonely) == {}


def test_the_same_reading_gives_the_same_verdict() -> None:
    """Graine fixe : deux lectures, un seul verdict — pas un tirage par affichage."""
    outcomes = [
        correlations.Outcome(item.day, item.run_id, 1.03 if index % 3 == 0 else 1.0)
        for index, item in enumerate(runs(12))
    ]
    contexts = [
        correlations.Context(item.run_id, {"morning": index % 3 == 0})
        for index, item in enumerate(outcomes)
    ]
    first = correlations.correlate([factor("morning")], contexts, correlations.deviations(outcomes))
    second = correlations.correlate(
        [factor("morning")], contexts, correlations.deviations(outcomes)
    )
    assert first == second


# ── Par les routes ────────────────────────────────────


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def test_an_imported_run_carries_its_load(app_client: TestClient, auth: dict[str, str]) -> None:
    from tests.test_activity_fit import import_fit, yesterday_at

    import_fit(
        app_client,
        auth,
        stream_file(
            paced((5000, 5.8)),
            start=yesterday_at(),
            heart_rates=[170],
            garmin=GarminExtras(watch_max_hr=202, session={"total_training_effect": 3.8}),
        ),
    )
    trends = app_client.get("/api/activity/runs/trends", headers=auth).json()

    # 29 minutes en zone 4 contre 202 : 4 × 29, le tout en séance dure.
    assert trends["load"]["acute"] == pytest.approx(4 * 29, abs=2)
    assert trends["load"]["hard_share"] == 1
    assert "encore" in trends["load"]["ratio_text"]
    assert {item["status"] for item in trends["correlations"]} == {"pending"}


def test_the_conditions_say_what_surrounded_the_run(
    app_client: TestClient, auth: dict[str, str], store: FileStore
) -> None:
    from tests.test_activity_fit import import_fit, yesterday_at

    created = import_fit(
        app_client, auth, stream_file(paced((3000, 5.8)), start=yesterday_at())
    ).json()
    eve = date.fromisoformat(created["date"]) - timedelta(days=1)
    app_client.post(
        "/api/body/weight", json={"date": created["date"], "weight_kg": 59.9}, headers=auth
    )
    # Un repas se crée horodaté « maintenant » par sa route : celui de la veille s'écrit
    # donc directement dans le stockage de test.
    meals: CsvRepository[MealRow] = CsvRepository(store, MEALS, MealRow)
    await_(
        meals.append(
            MealRow(
                datetime_=datetime.combine(eve, time(19, 30), tzinfo=tz()),
                meal_type="dîner",
                calories=900,
                protein_g=40,
            )
        )
    )

    context = app_client.get(f"/api/activity/runs/{created['id']}/conditions", headers=auth).json()[
        "context"
    ]
    assert "La veille\u00a0: 900 kcal · 40 g de protéines." in context
    assert "Aucune séance Cadence dans les 48 h avant." in context
    assert "Poids du jour\u00a0: 59,9 kg." in context
