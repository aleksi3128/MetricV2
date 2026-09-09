"""Historique de la nutrition — grille, courbe et habitudes (`NUT-11`).

Le métier vit dans `app/domains/nutrition/history.py`, en fonctions pures : la moitié de
ce fichier les éprouve sans fichier ni dépôt, l'autre moitié vérifie que la route sert
bien ce qu'elles calculent.

Ce qui est mesuré ici tient en une phrase : **on ne doit jamais confondre trois vides.**
Un jour sans repas, un jour noté sans ses calories, et un jour avant le premier repas
jamais consigné sont trois choses différentes, et une seule couleur pour les trois ferait
mentir la grille.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.dates import today_local, tz, week_start
from app.domains.nutrition import history
from app.domains.nutrition.models import MealRow
from app.storage.csv_repo import Row
from app.storage.files import FileStore
from app.storage.provider import StorageProvider
from tests.fake_webdav import FakeWebDav

HISTORY = "/api/nutrition/history"
MEALS_FILE = "Metric/nutrition/meals.csv"
SETTINGS_FILE = "Metric/settings/settings.csv"
HEADER = "datetime,meal_type,comment,photo,protein_g,added_sugar_g,calories,source\n"

TODAY = today_local()


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def moment(day: date, hour: int = 12) -> str:
    return datetime.combine(day, datetime.min.time(), tzinfo=tz()).replace(hour=hour).isoformat()


def meal(
    day: date,
    *,
    hour: int = 12,
    kind: str = "déjeuner",
    protein: float | None = None,
    sugar: float | None = None,
    calories: int | None = None,
) -> str:
    """Une ligne de `meals.csv`. Les champs vides sont vides, jamais des zéros."""
    return (
        f"{moment(day, hour)},{kind},repas,,"
        f"{'' if protein is None else protein},"
        f"{'' if sugar is None else sugar},"
        f"{'' if calories is None else calories},manual\n"
    )


def row(day: date, *, kind: str = "déjeuner", **fields: Any) -> Row[MealRow]:
    """Une ligne prête pour les fonctions pures, sans passer par le stockage."""
    model = MealRow(
        datetime_=datetime.combine(day, datetime.min.time(), tzinfo=tz()).replace(hour=12),
        meal_type=kind,
        **fields,
    )
    return Row(index=0, model=model, raw=model.to_csv())


def read(client: TestClient, auth: dict[str, str], query: str = "") -> Any:
    response = client.get(f"{HISTORY}{query}", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def cell_for(payload: Any, day: date) -> Any:
    return next(item for item in payload["days"] if item["date"] == day.isoformat())


# ── La plage (`NUT-11`) ───────────────────────────────


def test_the_range_is_whole_weeks_starting_on_monday(app_client: TestClient, auth: Any) -> None:
    """Une plage en jours donnerait une première colonne tronquée dans la grille."""
    payload = read(app_client, auth)

    start = date.fromisoformat(payload["from"])
    end = date.fromisoformat(payload["to"])

    assert start.weekday() == 0
    assert end.weekday() == 6
    assert (end - start).days + 1 == 5 * 7


@pytest.mark.parametrize(("key", "weeks"), [("month", 5), ("quarter", 13), ("year", 53)])
def test_each_range_serves_its_number_of_weeks(
    app_client: TestClient, auth: Any, key: str, weeks: int
) -> None:
    payload = read(app_client, auth, f"?range={key}")

    assert len(payload["days"]) == weeks * 7
    assert payload["range"] == key


def test_an_unknown_range_is_refused_by_the_contract(app_client: TestClient, auth: Any) -> None:
    """Déclarée en `Literal` : le refus vient du contrat, pas d'un code de garde."""
    assert app_client.get(f"{HISTORY}?range=decade", headers=auth).status_code == 422


def test_the_router_and_the_engine_agree_on_the_range_keys() -> None:
    """Deux listes de plages à tenir en phase divergeraient au premier ajout.

    Le `Literal` de la route ne peut pas se construire depuis `RANGE_WEEKS` — une
    annotation est statique. Ce test remplace la construction dynamique impossible.
    """
    from typing import get_args

    from app.domains.nutrition.router import HistoryRange

    assert set(get_args(get_args(HistoryRange)[0])) == set(history.RANGE_WEEKS)


def test_the_range_runs_to_the_end_of_the_current_week(app_client: TestClient, auth: Any) -> None:
    """Les jours à venir existent, en `future`. En faire des trous entaillerait la grille
    d'une encoche hebdomadaire qui ne veut rien dire."""
    payload = read(app_client, auth)
    sunday = week_start(TODAY) + timedelta(days=6)

    assert payload["to"] == sunday.isoformat()
    if sunday != TODAY:
        assert cell_for(payload, sunday)["reason"] == "future"


# ── Les trois vides ───────────────────────────────────


def test_a_day_without_a_meal_is_not_a_day_at_zero(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """La règle de `protein_points`, appliquée à la grille : un jour sans repas est un
    jour dont on ne sait rien, pas une journée à jeun."""
    dav.seed(MEALS_FILE, HEADER + meal(TODAY - timedelta(days=3), calories=2000))

    payload = read(app_client, auth)
    empty = cell_for(payload, TODAY - timedelta(days=1))

    assert empty["state"] == "off"
    assert empty["level"] == 0
    assert empty["reason"] is None
    assert empty["meals"] == 0


def test_a_day_logged_without_calories_is_hatched_not_empty(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """Relevé mais non chiffré. Le confondre avec un jour vide perdrait l'information la
    plus utile de la grille : « j'ai photographié, je n'ai pas noté »."""
    day = TODAY - timedelta(days=2)
    dav.seed(MEALS_FILE, HEADER + meal(day, protein=30))

    cell = cell_for(read(app_client, auth), day)

    assert cell["reason"] == "unmeasured"
    assert cell["state"] == "off"
    assert cell["meals"] == 1
    assert cell["calories_known"] == 0
    assert cell["protein_g"] == 30


def test_what_precedes_the_first_meal_ever_is_a_hole(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """`HEAT-07` : là il n'y avait rien à tenir, et une cellule pleine y raconterait une
    histoire qui n'a pas eu lieu."""
    first = TODAY - timedelta(days=3)
    dav.seed(MEALS_FILE, HEADER + meal(first, calories=1800))

    payload = read(app_client, auth)

    assert cell_for(payload, first - timedelta(days=1))["reason"] == "before_track"
    assert cell_for(payload, first)["reason"] is None


def test_an_empty_journal_leaves_every_cell_a_hole(app_client: TestClient, auth: Any) -> None:
    payload = read(app_client, auth)

    assert {cell["reason"] for cell in payload["days"]} <= {"before_track", "future"}
    assert payload["stats"]["measured_days"] == 0
    assert payload["stats"]["avg_calories"] is None


# ── Les niveaux ───────────────────────────────────────


@pytest.mark.parametrize(
    ("calories", "level"),
    [(0, 1), (1000, 1), (1100, 1), (1160, 2), (1760, 2), (1800, 3), (2310, 3), (2400, 4)],
)
def test_levels_read_as_a_share_of_the_target(calories: int, level: int) -> None:
    """Plus foncé veut dire plus mangé.

    Les bornes sont des **plafonds inclus** : jusqu'à 50 % de l'objectif, jusqu'à 80 %,
    jusqu'à 105 %, au-delà. Sur 2 200 kcal cela fait 1 100, 1 760 et 2 310.
    """
    assert history.level_of(calories, 2200) == level


def test_a_target_at_zero_does_not_divide_by_zero() -> None:
    """Les bornes de `Calories` autorisent zéro. L'écran n'y peut rien, il ne doit pas
    tomber pour autant."""
    assert history.level_of(1800, 0) == 4


def test_the_grid_never_accuses(app_client: TestClient, auth: Any, dav: FakeWebDav) -> None:
    """Ni `missed` ni `bonus` : manger sous l'objectif n'est pas un échec, le dépasser
    n'est pas une réussite."""
    dav.seed(
        MEALS_FILE,
        HEADER
        + meal(TODAY - timedelta(days=2), calories=400)
        + meal(TODAY - timedelta(days=1), calories=4000),
    )

    states = {cell["state"] for cell in read(app_client, auth)["days"]}

    assert states <= {"off", "done"}


# ── La courbe ─────────────────────────────────────────


def test_only_measured_days_enter_the_curve() -> None:
    """Un jour non chiffré n'y entre ni à zéro — valeur inventée — ni en trou, que
    `Chart` ne sait pas dessiner."""
    today = date(2026, 9, 6)
    rows = [
        row(date(2026, 9, 1), calories=2000),
        row(date(2026, 9, 2), protein_g=30.0),
        row(date(2026, 9, 3), calories=1800),
    ]

    payload = history.build(rows, today=today, range_key="month", target=2200, sugar_max=30)

    assert [point.date for point in payload.series] == [date(2026, 9, 1), date(2026, 9, 3)]
    assert payload.stats.measured_days == 2
    assert payload.stats.logged_days == 3


def test_the_trend_window_is_calendar_days_not_points() -> None:
    """La leçon de la tendance de poids : sept *points* couvriraient trois semaines après
    une pause, et lisseraient la mauvaise chose."""
    today = date(2026, 9, 6)
    rows = [
        row(date(2026, 8, 10), calories=1000),
        row(date(2026, 9, 5), calories=2000),
        row(date(2026, 9, 6), calories=3000),
    ]

    series = history.build(rows, today=today, range_key="month", target=2200, sugar_max=30).series

    # Le point du 6 ne voit que le 5 et lui-même : le 10 août est hors des sept jours.
    assert series[-1].trend_calories == 2500


def test_the_yearly_range_switches_the_curve_to_weeks() -> None:
    """365 points font 1,6 unité de tracé chacun : une bouillie, et des barres de bande
    sous le pixel."""
    today = date(2026, 9, 6)
    rows = [row(date(2026, 9, 1), calories=2000), row(date(2026, 9, 3), calories=1000)]

    payload = history.build(rows, today=today, range_key="year", target=2200, sugar_max=30)

    assert payload.granularity == "week"
    assert len(payload.series) == 1
    point = payload.series[0]
    assert point.date == week_start(date(2026, 9, 1))
    assert point.calories == 1500
    assert point.days == 2
    # Une moyenne glissante d'une moyenne hebdomadaire lisserait deux fois la même chose.
    assert point.trend_calories is None


def test_the_monthly_range_stays_on_days() -> None:
    payload = history.build(
        [], today=date(2026, 9, 6), range_key="month", target=2200, sugar_max=30
    )

    assert payload.granularity == "day"


# ── Statistiques et habitudes ─────────────────────────


def test_averages_ignore_days_that_were_never_measured() -> None:
    today = date(2026, 9, 6)
    rows = [
        row(date(2026, 9, 1), calories=2000, protein_g=100),
        row(date(2026, 9, 2), calories=2400, protein_g=140),
    ]

    stats = history.build(rows, today=today, range_key="month", target=2200, sugar_max=30).stats

    assert stats.avg_calories == 2200
    assert stats.avg_protein_g == 120
    assert stats.days > stats.measured_days


def test_on_target_days_allow_ten_percent_either_way() -> None:
    today = date(2026, 9, 6)
    rows = [
        row(date(2026, 9, 1), calories=2200),
        row(date(2026, 9, 2), calories=1990),  # -9,5 %
        row(date(2026, 9, 3), calories=1900),  # -13,6 %
        row(date(2026, 9, 4), calories=2410),  # +9,5 %
    ]

    stats = history.build(rows, today=today, range_key="month", target=2200, sugar_max=30).stats

    assert stats.on_target_days == 3


def test_seven_weekdays_are_always_served() -> None:
    """Faire disparaître un jour sans mesure décalerait les six autres, et la lecture
    d'un coup d'œil serait fausse."""
    payload = history.build(
        [row(date(2026, 9, 1), calories=2000)],
        today=date(2026, 9, 6),
        range_key="month",
        target=2200,
        sugar_max=30,
    )

    assert [profile.weekday for profile in payload.weekdays] == list(range(7))
    tuesday = payload.weekdays[1]
    assert tuesday.avg_calories == 2000 and tuesday.days == 1
    assert payload.weekdays[0].avg_calories is None


def test_meal_types_share_the_calories_of_the_range() -> None:
    today = date(2026, 9, 6)
    rows = [
        row(date(2026, 9, 1), kind="déjeuner", calories=900),
        row(date(2026, 9, 2), kind="déjeuner", calories=600),
        row(date(2026, 9, 2), kind="dîner", calories=500),
    ]

    shares = history.build(rows, today=today, range_key="month", target=2200, sugar_max=30).types

    assert [share.meal_type for share in shares] == ["déjeuner", "dîner"]
    assert shares[0].calories == 1500
    assert shares[0].share == 0.75
    assert shares[0].meals == 2


def test_no_share_is_drawn_without_a_single_calorie() -> None:
    """Quatre parts égales de zéro calorie seraient une figure sans mesure derrière."""
    payload = history.build(
        [row(date(2026, 9, 1), protein_g=20)],
        today=date(2026, 9, 6),
        range_key="month",
        target=2200,
        sugar_max=30,
    )

    assert payload.types == []


# ── L'objectif ────────────────────────────────────────


def test_the_target_comes_from_the_settings(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    dav.seed(SETTINGS_FILE, "key,value\ntarget_calories,1800\n")
    dav.seed(MEALS_FILE, HEADER + meal(TODAY - timedelta(days=1), calories=1800))

    payload = read(app_client, auth)

    assert payload["target_calories"] == 1800
    assert cell_for(payload, TODAY - timedelta(days=1))["level"] == 3


def test_the_day_totals_carry_the_calorie_target(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """L'anneau du jour se lit contre la même référence que la grille."""
    dav.seed(MEALS_FILE, HEADER + meal(TODAY, calories=1100))

    totals = app_client.get("/api/nutrition", headers=auth).json()["totals"]

    assert totals["calories_target"] == 2200
    assert totals["calories_ratio"] == 0.5


def test_the_calorie_ratio_is_capped_like_the_protein_one(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """Un anneau ne sait pas dessiner un dépassement ; c'est le détail qui le dit."""
    dav.seed(MEALS_FILE, HEADER + meal(TODAY, calories=9000))

    totals = app_client.get("/api/nutrition", headers=auth).json()["totals"]

    assert totals["calories_ratio"] == 1.0
    assert totals["calories"] == 9000


# ── La série d'agrégats (`AGG-04`) ────────────────────


def test_calories_are_a_tracked_metric(app_client: TestClient, auth: Any, dav: FakeWebDav) -> None:
    """Le catalogue de `AGG-04` gagne une courbe, sans seconde définition du calcul."""
    dav.seed(MEALS_FILE, HEADER + meal(TODAY, calories=2100) + meal(TODAY, calories=300))

    series = app_client.get("/api/aggregates/series?metric=daily_calories", headers=auth).json()

    assert series["points"][-1]["value"] == 2400


def test_a_day_logged_without_calories_stays_out_of_the_metric(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """Le compter à zéro ferait plonger toute moyenne qui s'en sert."""
    dav.seed(MEALS_FILE, HEADER + meal(TODAY - timedelta(days=1), protein=40))

    series = app_client.get("/api/aggregates/series?metric=daily_calories", headers=auth).json()

    assert series["points"] == []
