"""Profondeur de l'écran Nutrition — grille, courbe et habitudes (`NUT-11`).

Tout ce qui suit répond à une seule question : « est-ce que je mange comme d'habitude ? ».
Elle demande de comparer un jour à une plage, ce que l'écran ne savait pas faire — il ne
montrait qu'aujourd'hui.

## Trois règles qui décident du reste

**Un jour sans repas consigné n'est pas un jour à zéro calorie.** C'est un jour dont on ne
sait rien, et `NutritionService.protein_points` le dit déjà pour les protéines. Il ne
descend donc pas dans la courbe, et sa cellule de grille ne prend aucune couleur.

**Un jour noté sans ses calories n'est pas non plus un jour à zéro.** Il a été relevé — la
photo est là, le repas existe — mais rien n'a été chiffré. Sa cellule est hachurée, ce qui
le distingue à l'œil d'un jour vide comme d'un jour à 800 kcal.

**La grille n'accuse pas.** Le vocabulaire d'états de `HEAT-05` en compte quatre ; la
nutrition n'en émet que deux, `done` et `off`. Manger sous l'objectif un jour de repos
n'est pas un jour manqué, et le dépasser n'est pas un bonus — les deux mots qui restent
porteraient un jugement que ce module n'a pas à porter.

## Sur le découpage en semaines

Les plages se comptent en **semaines pleines alignées sur le lundi**, jamais en jours. La
grille se dessine en colonnes de sept : une plage de « 30 jours » y produirait une
première colonne tronquée et décalée par rapport à toutes les autres. Même arbitrage que
`heatmap.engine.default_range` (**D6**) — une colonne tronquée se voit, un décalage d'un
jour ne se voit pas et fausse la lecture.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal

from app.core.dates import days_between, local_day_of, week_start
from app.domains.nutrition.models import MealRow
from app.domains.nutrition.schemas import (
    HistoryDay,
    HistoryPoint,
    HistoryStats,
    NutritionHistory,
    TypeShare,
    WeekdayProfile,
)
from app.storage.csv_repo import Row

#: Clés de plage publiées, et leur longueur en semaines.
#:
#: Un mois vaut cinq semaines et non « 30 jours » : c'est ce qui remplit une grille de
#: cinq colonnes sans en tronquer une. L'année en vaut 53 comme la grille d'assiduité,
#: pour que les deux écrans se lisent à la même échelle.
RANGE_WEEKS: dict[str, int] = {"month": 5, "quarter": 13, "year": 53}

RangeKey = Literal["month", "quarter", "year"]

#: Au-delà de cette longueur, la courbe passe à la semaine.
#:
#: 365 points dans les 588 unités de tracé de `Chart` font 1,6 unité par point : la
#: courbe devient une bouillie et les barres de la bande passent sous le pixel. Mesuré
#: sur le composant, pas estimé.
WEEKLY_ABOVE_WEEKS = 20

#: Fenêtre de la tendance, en jours **calendaires**.
#:
#: Calendaire et non « sept points », pour la raison que la tendance de poids a apprise :
#: on ne chiffre pas ses repas tous les jours, et une moyenne des sept derniers *jours
#: chiffrés* couvrirait trois semaines après une pause — elle lisserait la mauvaise chose.
TREND_DAYS = 7

#: Tolérance autour de l'objectif pour qu'une journée compte comme « dans la cible ».
ON_TARGET = 0.10

#: Plafonds des trois premiers niveaux d'intensité, en part de l'objectif — au-delà du
#: dernier, c'est le quatrième (`HEAT-15` pour la forme).
#:
#: Plus foncé veut dire **plus mangé**, jamais « mieux » : une grille de nutrition n'a pas
#: à féliciter une journée ni à en accuser une autre.
LEVELS: tuple[float, ...] = (0.5, 0.8, 1.05)


@dataclass(slots=True)
class DayTally:
    """Ce qu'un jour a reçu. Les compteurs sont séparés des sommes à dessein.

    `meals` dit qu'on a relevé, `calories_known` dit qu'on a chiffré. Les confondre
    ferait passer une journée photographiée sans chiffres pour une journée à jeun.
    """

    calories: int = 0
    protein_g: float = 0.0
    added_sugar_g: float = 0.0
    meals: int = 0
    calories_known: int = 0
    #: Calories par type de repas, pour la répartition de la plage.
    by_type: dict[str, tuple[int, int]] = field(default_factory=dict)


def tally_days(rows: list[Row[MealRow]]) -> dict[date, DayTally]:
    """Journal replié par jour local (`HEAT-32`).

    Le rattachement au jour suit le fuseau local, comme `meal_days` et `protein_points` :
    trois découpages du même journal en donneraient trois totaux.
    """
    per_day: dict[date, DayTally] = defaultdict(DayTally)
    for row in rows:
        meal = row.model
        tally = per_day[local_day_of(meal.datetime_)]
        tally.meals += 1
        tally.protein_g += meal.protein_g or 0
        tally.added_sugar_g += meal.added_sugar_g or 0
        if meal.calories is not None:
            tally.calories += meal.calories
            tally.calories_known += 1
        calories, meals = tally.by_type.get(meal.meal_type, (0, 0))
        tally.by_type[meal.meal_type] = (calories + (meal.calories or 0), meals + 1)
    return per_day


def window(today: date, range_key: str) -> tuple[date, date]:
    """Bornes de la plage, alignées sur des semaines pleines.

    La plage se termine au **dimanche de la semaine en cours** et non aujourd'hui : les
    jours encore à venir existent dans la grille, sans quoi chaque grille porterait une
    entaille hebdomadaire qui ne veut rien dire.
    """
    weeks = RANGE_WEEKS.get(range_key, RANGE_WEEKS["month"])
    end = week_start(today) + timedelta(days=6)
    return week_start(today) - timedelta(weeks=weeks - 1), end


def level_of(calories: int, target: float) -> int:
    """Niveau 1 à 4 selon la part de l'objectif atteinte.

    Un objectif à zéro — que les bornes de `Calories` autorisent — ne définit aucune
    échelle : tout ce qui est chiffré se retrouve alors au dernier niveau, plutôt que de
    faire diviser par zéro un écran qui n'y peut rien.
    """
    if target <= 0:
        return len(LEVELS) + 1
    ratio = calories / target
    for index, bound in enumerate(LEVELS):
        if ratio <= bound:
            return index + 1
    return len(LEVELS) + 1


def _cell(
    day: date,
    tally: DayTally | None,
    *,
    today: date,
    first: date | None,
    target: float,
) -> HistoryDay:
    """Une cellule de la grille, et la raison de son état quand elle est vide."""
    counted = tally or DayTally()

    reason: str | None = None
    if day > today:
        reason = "future"
    elif first is None or day < first:
        reason = "before_track"
    elif counted.meals and not counted.calories_known:
        reason = "unmeasured"

    measured = reason is None and counted.calories_known > 0
    return HistoryDay(
        date=day,
        calories=counted.calories,
        protein_g=round(counted.protein_g, 1),
        added_sugar_g=round(counted.added_sugar_g, 1),
        meals=counted.meals,
        calories_known=counted.calories_known,
        state="done" if measured else "off",
        level=level_of(counted.calories, target) if measured else 0,
        reason=reason,
    )


def _daily_series(
    days: list[date], per_day: dict[date, DayTally], *, today: date
) -> list[HistoryPoint]:
    """Un point par jour **chiffré**, avec sa tendance glissante.

    Les jours non chiffrés ne sont ni à zéro — ce serait une valeur inventée — ni un
    trou, que `Chart` ne sait pas dessiner. Ils ne descendent simplement pas dans la
    courbe, et la note sous le graphique dit combien de jours la composent.
    """
    measured = [
        (day, per_day[day])
        for day in days
        if day <= today and day in per_day and per_day[day].calories_known > 0
    ]

    points: list[HistoryPoint] = []
    for position, (day, tally) in enumerate(measured):
        horizon = day - timedelta(days=TREND_DAYS - 1)
        recent = [
            other.calories for other_day, other in measured[: position + 1] if other_day >= horizon
        ]
        points.append(
            HistoryPoint(
                date=day,
                calories=tally.calories,
                trend_calories=round(sum(recent) / len(recent), 1) if recent else None,
                protein_g=round(tally.protein_g, 1),
                added_sugar_g=round(tally.added_sugar_g, 1),
                days=1,
            )
        )
    return points


def _weekly_series(
    days: list[date], per_day: dict[date, DayTally], *, today: date
) -> list[HistoryPoint]:
    """Un point par semaine, portant la **moyenne des jours chiffrés** de la semaine.

    Pas de tendance ici : une moyenne glissante d'une moyenne hebdomadaire lisserait deux
    fois la même chose, et la courbe l'annoncerait comme un signal qu'elle n'est pas.
    """
    per_week: dict[date, list[DayTally]] = defaultdict(list)
    for day in days:
        if day > today:
            continue
        tally = per_day.get(day)
        if tally and tally.calories_known > 0:
            per_week[week_start(day)].append(tally)

    return [
        HistoryPoint(
            date=start,
            calories=round(sum(item.calories for item in tallies) / len(tallies)),
            trend_calories=None,
            protein_g=round(sum(item.protein_g for item in tallies) / len(tallies), 1),
            added_sugar_g=round(sum(item.added_sugar_g for item in tallies) / len(tallies), 1),
            days=len(tallies),
        )
        for start, tallies in sorted(per_week.items())
    ]


def _stats(
    cells: list[HistoryDay], *, today: date, target: float, sugar_max: float
) -> HistoryStats:
    """Les chiffres de la plage. Aucun n'est déductible d'un autre côté client."""
    past = [cell for cell in cells if cell.date <= today and cell.reason != "before_track"]
    measured = [cell for cell in past if cell.calories_known > 0]
    protein_days = [cell for cell in past if cell.meals > 0]

    return HistoryStats(
        target_calories=target,
        days=len(past),
        logged_days=len(protein_days),
        measured_days=len(measured),
        # `None` et non zéro : sans jour chiffré il n'y a pas de moyenne, et un zéro se
        # lirait comme une journée à jeun (`L02` — aucune valeur inventée).
        avg_calories=(
            round(sum(cell.calories for cell in measured) / len(measured)) if measured else None
        ),
        avg_protein_g=(
            round(sum(cell.protein_g for cell in protein_days) / len(protein_days), 1)
            if protein_days
            else None
        ),
        avg_added_sugar_g=(
            round(sum(cell.added_sugar_g for cell in protein_days) / len(protein_days), 1)
            if protein_days
            else None
        ),
        on_target_days=sum(
            1
            for cell in measured
            if target > 0 and abs(cell.calories - target) <= target * ON_TARGET
        ),
        over_sugar_days=sum(1 for cell in protein_days if cell.added_sugar_g > sugar_max),
    )


def _weekdays(cells: list[HistoryDay], *, today: date, target: float) -> list[WeekdayProfile]:
    """Moyenne par jour de la semaine, lundi en premier.

    Sept entrées **toujours**, y compris celles sans aucun jour chiffré : l'écran doit
    pouvoir dessiner sept barres dont certaines portent un tiret. Les faire disparaître
    décalerait les six autres et rendrait la lecture fausse d'un coup d'œil.
    """
    buckets: dict[int, list[int]] = {index: [] for index in range(7)}
    for cell in cells:
        if cell.date <= today and cell.calories_known > 0:
            buckets[cell.date.weekday()].append(cell.calories)

    averages = {
        index: round(sum(values) / len(values)) if values else None
        for index, values in buckets.items()
    }
    highest = max((value for value in averages.values() if value is not None), default=0)

    return [
        WeekdayProfile(
            weekday=index,
            avg_calories=average,
            days=len(buckets[index]),
            ratio=round(average / highest, 4) if average is not None and highest else 0.0,
            over_target=average is not None and target > 0 and average > target,
        )
        for index, average in sorted(averages.items())
    ]


def _types(days: list[date], per_day: dict[date, DayTally], *, today: date) -> list[TypeShare]:
    """Part de chaque type de repas dans les calories de la plage.

    Vide quand rien n'est chiffré : une répartition de zéro calorie en quatre parts
    égales serait une figure sans aucune mesure derrière.
    """
    totals: dict[str, tuple[int, int]] = {}
    for day in days:
        if day > today:
            continue
        tally = per_day.get(day)
        if tally is None:
            continue
        for meal_type, (calories, meals) in tally.by_type.items():
            known, counted = totals.get(meal_type, (0, 0))
            totals[meal_type] = (known + calories, counted + meals)

    overall = sum(calories for calories, _ in totals.values())
    if overall <= 0:
        return []

    return sorted(
        (
            TypeShare(
                meal_type=meal_type,
                calories=calories,
                share=round(calories / overall, 4),
                meals=meals,
            )
            for meal_type, (calories, meals) in totals.items()
        ),
        key=lambda share: share.calories,
        reverse=True,
    )


def build(
    rows: list[Row[MealRow]],
    *,
    today: date,
    range_key: str,
    target: float,
    sugar_max: float,
) -> NutritionHistory:
    """Assemble la réponse complète de la section historique.

    Une seule fonction pure, sans stockage : c'est ce qui permet de l'éprouver sur une
    poignée de lignes construites à la main, sans fichier ni dépôt.
    """
    start, end = window(today, range_key)
    days = days_between(start, end)
    per_day = tally_days(rows)

    # La première ligne du journal **tous jours confondus**, et non la première de la
    # plage : ce qui précède le premier repas jamais consigné est un trou (`HEAT-07`),
    # ce qui suit est une journée sans repas notés, et les deux ne se peignent pas pareil.
    first = min(per_day) if per_day else None

    cells = [_cell(day, per_day.get(day), today=today, first=first, target=target) for day in days]
    weekly = RANGE_WEEKS.get(range_key, RANGE_WEEKS["month"]) > WEEKLY_ABOVE_WEEKS

    return NutritionHistory(
        range=range_key,
        from_=start,
        to=end,
        today=today,
        granularity="week" if weekly else "day",
        target_calories=target,
        added_sugar_max_g=sugar_max,
        days=cells,
        series=(
            _weekly_series(days, per_day, today=today)
            if weekly
            else _daily_series(days, per_day, today=today)
        ),
        stats=_stats(cells, today=today, target=target, sugar_max=sugar_max),
        weekdays=_weekdays(cells, today=today, target=target),
        types=_types(days, per_day, today=today),
    )
