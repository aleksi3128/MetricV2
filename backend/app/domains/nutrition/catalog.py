"""Ce qu'on mange, compté par aliment et par plage (`NUT-18`, `NUT-19`).

Le journal des aliments (`intake.csv`) dit « 180 g de riz, le 14 septembre, dans le repas
de 12 h 30 ». La page catalogue pose l'autre question : « combien de riz cette semaine, et
depuis quand n'en ai-je pas mangé ». Tout le passage de l'un à l'autre est ici, en
fonctions pures — le service lit les fichiers, ce module compte.

## Les plages sont calendaires

Jour en cours, semaine depuis lundi, mois en cours, trimestre en cours. C'est un choix, et
il a un prix qu'il vaut mieux écrire que découvrir : **un 1er du mois affiche presque
rien**. Il l'emporte parce que la grille de `NUT-11` compte déjà en semaines pleines
alignées sur le lundi, et que deux découpages du temps dans le même écran donneraient deux
réponses à « cette semaine ».

Une plage ne va **jamais au-delà d'aujourd'hui**. La borne haute d'un mois en cours est
le jour courant, pas le 31 : afficher « 1er au 30 septembre » pendant qu'on en est au 20
ferait passer une somme partielle pour un mois entier.

## Le rattachement d'une ligne de journal à un aliment

Par le **nom réduit** — même casse, mêmes espaces —, avec l'identifiant du catalogue comme
relais quand il existe. Jamais approximativement : c'est la règle de `NUT-12`, et deux
yaourts dont les noms diffèrent d'une lettre restent deux produits.

Le relais par identifiant n'est pas une commodité. Il fait qu'une entrée **renommée** garde
son histoire : les lignes du journal portent son identifiant, et c'est lui qui les ramène
vers le nouveau nom.

## Un aliment mangé sans être au catalogue

« 150 g de légumes » n'a aucune valeur pour 100 g : il n'entre pas au catalogue — il n'y
apprendrait rien —, mais il était dans l'assiette et il est au journal. Le compter comme
une entrée à part entière est le même parti pris que `LoadList.orphans` : ce que l'écran ne
montrerait pas deviendrait inatteignable, et la page promet de montrer **tout** ce qu'on
mange.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date

from app.core.dates import local_day_of, week_start
from app.domains.nutrition.models import IngredientRow, IntakeRow
from app.domains.nutrition.schemas import (
    RANGE_KEYS,
    CatalogEntry,
    CatalogIntake,
    CatalogPeriod,
    CatalogRange,
)
from app.storage.csv_repo import Row

#: Les derniers repas montrés sur la fiche d'un aliment.
#:
#: Dix, parce que c'est ce qui tient sous les chiffres sans faire défiler une feuille de
#: téléphone, et parce que la question qu'ils servent — « d'où sortent ces 720 g » — se
#: répond sur les derniers, pas sur l'historique complet.
RECENT = 10


def quarter_start(day: date) -> date:
    """Premier jour du trimestre **calendaire** auquel appartient ce jour."""
    return date(day.year, 3 * ((day.month - 1) // 3) + 1, 1)


def bounds(key: CatalogRange, today: date) -> tuple[date, date]:
    """Les bornes d'une plage, incluses. La borne haute est toujours le jour courant."""
    if key == "day":
        return today, today
    if key == "week":
        return week_start(today), today
    if key == "month":
        return date(today.year, today.month, 1), today
    return quarter_start(today), today


def name_key(name: str) -> str:
    """Le nom réduit — la seule clé de rapprochement du projet (`NUT-12`)."""
    return name.strip().casefold()


@dataclass
class _Tally:
    """Ce qu'un aliment pèse sur une plage : des repas, et des grammes."""

    #: Les horodatages de repas, et non un compteur : deux lignes du même aliment dans le
    #: même plat — « riz » pesé en deux fois — font **un** repas, pas deux.
    meals: set[str] = field(default_factory=set)
    quantity_g: float = 0.0

    @property
    def times(self) -> int:
        return len(self.meals)


def _relay(rows: Sequence[Row[IngredientRow]]) -> dict[str, str]:
    """Identifiant du catalogue → nom réduit. Ce qui fait survivre un renommage."""
    return {row.model.id: name_key(row.model.name) for row in rows if row.model.id}


def _key_of(intake: IntakeRow, relay: dict[str, str]) -> str:
    """La clé d'une ligne de journal : son identifiant s'il mène quelque part, son nom sinon."""
    return relay.get(intake.ingredient_id) or name_key(intake.name)


def tally(
    intake: Iterable[Row[IntakeRow]],
    relay: dict[str, str],
    *,
    start: date,
    end: date,
) -> dict[str, _Tally]:
    """Ce que chaque aliment pèse entre deux jours, bornes incluses."""
    totals: dict[str, _Tally] = defaultdict(_Tally)
    for row in intake:
        day = local_day_of(row.model.datetime_)
        if day < start or day > end:
            continue
        counted = totals[_key_of(row.model, relay)]
        counted.meals.add(row.model.datetime_.isoformat())
        counted.quantity_g += row.model.quantity_g
    return totals


def last_seen(intake: Iterable[Row[IntakeRow]], relay: dict[str, str]) -> dict[str, date]:
    """Le jour du dernier repas de chaque aliment, **toutes plages confondues**.

    Hors plage délibérément : c'est lui qui trie la liste, et un aliment mangé la semaine
    dernière doit se placer avant un aliment mangé il y a six mois même quand la plage
    affichée ne montre ni l'un ni l'autre.
    """
    latest: dict[str, date] = {}
    for row in intake:
        day = local_day_of(row.model.datetime_)
        key = _key_of(row.model, relay)
        if key not in latest or day > latest[key]:
            latest[key] = day
    return latest


def _entry(
    row: Row[IngredientRow],
    counted: _Tally | None,
    seen: date | None,
) -> CatalogEntry:
    model = row.model
    return CatalogEntry(
        id=row.index,
        token=row.token,
        ingredient_id=model.id,
        name=model.name,
        catalogued=True,
        calories_100g=model.calories_100g,
        protein_100g=model.protein_100g,
        added_sugar_100g=model.added_sugar_100g,
        saturated_fat_100g=model.saturated_fat_100g,
        fiber_100g=model.fiber_100g,
        portion_g=model.portion_g,
        barcode=model.barcode,
        edited_on=model.edited_on,
        times=0 if counted is None else counted.times,
        quantity_g=0.0 if counted is None else round(counted.quantity_g, 1),
        last_on=seen,
    )


def entries(
    catalogue: Sequence[Row[IngredientRow]],
    intake: Sequence[Row[IntakeRow]],
    *,
    start: date,
    end: date,
) -> list[CatalogEntry]:
    """La liste de la page : le catalogue, plus ce qu'on a mangé sans l'y avoir mis.

    **Triée du repas le plus récent au plus ancien**, et les aliments jamais consignés en
    fin de liste par ordre alphabétique — l'écran les range dans leur propre section. Un
    aliment jamais consigné n'a pas de date : le trier « par date » le ferait apparaître
    au hasard des égalités.
    """
    relay = _relay(catalogue)
    counted = tally(intake, relay, start=start, end=end)
    seen = last_seen(intake, relay)

    known = {name_key(row.model.name) for row in catalogue if row.model.name}
    rows = [
        _entry(row, counted.get(name_key(row.model.name)), seen.get(name_key(row.model.name)))
        for row in catalogue
        if row.model.id and row.model.name
    ]

    # Les aliments qui n'existent qu'au journal. Le nom affiché est celui de leur **dernière**
    # ligne : c'est la graphie la plus récente, et donc celle qu'on reconnaîtra.
    labels: dict[str, str] = {}
    for row in intake:
        key = _key_of(row.model, relay)
        if key not in known and row.model.name.strip():
            labels[key] = row.model.name.strip()

    rows.extend(
        CatalogEntry(
            name=label,
            catalogued=False,
            times=0 if key not in counted else counted[key].times,
            quantity_g=0.0 if key not in counted else round(counted[key].quantity_g, 1),
            last_on=seen.get(key),
        )
        for key, label in labels.items()
    )

    # Le plus récent d'abord, les jamais consignés ensuite, et le nom pour départager.
    # L'ordinal négatif inverse la seule composante qui doit l'être, sans second passage.
    rows.sort(
        key=lambda entry: (
            entry.last_on is None,
            -entry.last_on.toordinal() if entry.last_on else 0,
            entry.name.casefold(),
        )
    )
    return rows


def periods(
    intake: Sequence[Row[IntakeRow]],
    relay: dict[str, str],
    key: str,
    today: date,
) -> list[CatalogPeriod]:
    """Les quatre plages d'un aliment, d'un coup — ce que montre sa fiche."""
    measured: list[CatalogPeriod] = []
    for name in RANGE_KEYS:
        start, end = bounds(name, today)
        counted = tally(intake, relay, start=start, end=end).get(key)
        measured.append(
            CatalogPeriod(
                range=name,
                start=start,
                end=end,
                times=0 if counted is None else counted.times,
                quantity_g=0.0 if counted is None else round(counted.quantity_g, 1),
            )
        )
    return measured


def recent(
    intake: Sequence[Row[IntakeRow]],
    relay: dict[str, str],
    key: str,
    *,
    limit: int = RECENT,
) -> list[CatalogIntake]:
    """Les derniers repas où l'aliment apparaît, du plus récent au plus ancien."""
    lines = [
        CatalogIntake(
            date=local_day_of(row.model.datetime_),
            quantity_g=round(row.model.quantity_g, 1),
        )
        for row in intake
        if _key_of(row.model, relay) == key
    ]
    lines.sort(key=lambda line: line.date, reverse=True)
    return lines[:limit]
