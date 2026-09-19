"""Ce qu'on déduit d'une collection de courses (`ACT-20`).

Module **pur**, comme `splits.py` : aucun fichier, aucun modèle, ni pydantic ni FastAPI.
Ce qui décide se teste sur des valeurs fixes ; ce qui dessine se regarde.

## Le piège de ce module : une allure ne se compare pas à une autre allure

`splits.py` compare huit kilomètres d'une **même** course, courus d'affilée par la même
personne dans les mêmes conditions. Ici on compare des sorties entre elles, et deux
allures ne veulent plus dire la même chose : 5'30" sur 15 km est une bien meilleure course
que 5'10" sur 3 km. Une courbe d'allure au fil des mois montre donc surtout **quelles
distances ont été courues**, et se lit comme une progression alors qu'elle n'en est pas.

Trois réponses, et aucune n'est de cacher la courbe :

* **Les bandes de distance.** Le meilleur temps se compare à l'intérieur d'une bande —
  moins de 5 km, 5 à 10, 10 et plus — où les sorties sont comparables entre elles. C'est
  ce qu'un coureur suit réellement, et c'est là que « je progresse » a un sens.
* **Le volume mensuel**, qui ne souffre pas du problème : des kilomètres sont des
  kilomètres, et leur somme est une progression sans réserve à poser.
* **La fenêtre glissante**, qui compare les N dernières sorties aux N précédentes plutôt
  qu'une course à une course — sur cinq sorties, le mélange des distances s'atténue sans
  disparaître, et l'écran le dit.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

#: Bornes des bandes de distance, en kilomètres. Trois seulement : elles doivent contenir
#: assez de sorties pour qu'un « meilleur temps » veuille dire quelque chose, et un
#: découpage plus fin donnerait des bandes à une course dont le record est la course.
BANDS: tuple[tuple[str, float, float | None], ...] = (
    ("Moins de 5 km", 0.0, 5.0),
    ("5 à 10 km", 5.0, 10.0),
    ("10 km et plus", 10.0, None),
)

#: Taille maximale de la fenêtre glissante. Cinq sorties lissent le mélange des distances
#: sans remonter à des mois trop anciens pour que la comparaison porte sur la même forme.
MAX_WINDOW = 5

#: En deçà, une fenêtre ne compare rien : deux sorties contre deux, c'est une sortie lente
#: qui décide du verdict. On rend `None` plutôt qu'une tendance que la donnée ne porte pas.
MIN_WINDOW = 2


@dataclass(frozen=True, slots=True)
class Sortie:
    """Une course réduite à ce qu'une progression regarde."""

    index: int
    day: date
    distance_km: float
    duration_min: float
    pace_min_km: float | None = None
    cadence_spm: int | None = None


@dataclass(frozen=True, slots=True)
class Band:
    """Une bande de distance et son meilleur temps.

    `best_index` désigne la course, pour que l'écran puisse y mener sans chercher.
    """

    label: str
    runs: int = 0
    best_pace_min_km: float | None = None
    best_index: int | None = None
    best_day: date | None = None
    average_pace_min_km: float | None = None
    total_distance_km: float = 0.0


@dataclass(frozen=True, slots=True)
class Month:
    """Un mois de course. C'est ici que « progresser » se lit sans réserve."""

    #: `2026-08`, trié et lisible tel quel. L'écran le met en forme, il ne le calcule pas.
    month: str
    runs: int = 0
    distance_km: float = 0.0
    minutes: float = 0.0
    pace_min_km: float | None = None


@dataclass(frozen=True, slots=True)
class Window:
    """Les N dernières sorties contre les N précédentes."""

    size: int = 0
    recent_pace_min_km: float | None = None
    previous_pace_min_km: float | None = None
    #: Secondes par kilomètre, récent moins précédent. **Négatif = plus rapide.**
    pace_delta_s_per_km: float | None = None
    recent_distance_km: float | None = None
    previous_distance_km: float | None = None
    distance_delta_km: float | None = None


@dataclass(frozen=True, slots=True)
class Progress:
    """Tout ce que la page « Toutes tes courses » affiche, calculé une fois."""

    total_runs: int = 0
    total_distance_km: float = 0.0
    total_minutes: float = 0.0
    #: Allure de l'ensemble : distance totale sur temps total, et non la moyenne des
    #: allures — une sortie de 2 km pèserait autant qu'une de 20 dans la seconde.
    overall_pace_min_km: float | None = None

    best_pace_min_km: float | None = None
    best_pace_index: int | None = None
    best_pace_day: date | None = None
    longest_distance_km: float | None = None
    longest_distance_index: int | None = None
    longest_distance_day: date | None = None
    longest_duration_min: float | None = None

    bands: list[Band] = field(default_factory=list)
    months: list[Month] = field(default_factory=list)
    window: Window = field(default_factory=Window)

    #: Bornes de l'axe d'allure de la courbe de tendance, **le plus lent d'abord** : l'axe
    #: part retourné, comme partout où ce dépôt trace une allure.
    pace_domain_min_km: tuple[float, float] | None = None
    #: Bornes de l'axe des volumes mensuels, le plus petit d'abord — un volume se lit dans
    #: le sens habituel, à l'inverse d'une allure.
    volume_domain_km: tuple[float, float] | None = None
    #: Bornes de l'axe des **distances**, pour le nuage de points qui croise distance et
    #: allure. Le plus court d'abord : une distance se lit dans le sens habituel.
    distance_domain_km: tuple[float, float] | None = None


def _round(value: float | None, digits: int = 2) -> float | None:
    return None if value is None else round(value, digits)


def _pace_of(sorties: list[Sortie]) -> float | None:
    """Allure d'un groupe : temps total sur distance totale.

    **Et non la moyenne des allures.** Une sortie de 2 km y pèserait autant qu'une de
    20 km, et un footing de récupération suffirait à faire chuter un mois entier.
    """
    distance = sum(item.distance_km for item in sorties)
    minutes = sum(item.duration_min for item in sorties)
    return minutes / distance if distance > 0 and minutes > 0 else None


def analyse(sorties: list[Sortie]) -> Progress:
    """Les chiffres de la page « Toutes tes courses », calculés côté serveur.

    L'entrée arrive dans n'importe quel ordre ; tout ce qui dépend du temps est trié ici.
    """
    if not sorties:
        return Progress()

    ordered = sorted(sorties, key=lambda item: (item.day, item.index))
    paced = [item for item in ordered if item.pace_min_km]

    fastest = min(paced, key=lambda item: item.pace_min_km or 0.0) if paced else None
    longest = max(ordered, key=lambda item: item.distance_km)

    return Progress(
        total_runs=len(ordered),
        total_distance_km=round(sum(item.distance_km for item in ordered), 2),
        total_minutes=round(sum(item.duration_min for item in ordered), 1),
        overall_pace_min_km=_round(_pace_of(ordered), 3),
        best_pace_min_km=_round(fastest.pace_min_km, 3) if fastest else None,
        best_pace_index=fastest.index if fastest else None,
        best_pace_day=fastest.day if fastest else None,
        longest_distance_km=_round(longest.distance_km),
        longest_distance_index=longest.index,
        longest_distance_day=longest.day,
        longest_duration_min=_round(max(item.duration_min for item in ordered), 1),
        bands=_bands(ordered),
        months=_months(ordered),
        window=_window(ordered),
        pace_domain_min_km=_domain([item.pace_min_km or 0.0 for item in paced], inverted=True),
        volume_domain_km=_domain([month.distance_km for month in _months(ordered)], inverted=False),
        distance_domain_km=_domain([item.distance_km for item in ordered], inverted=False),
    )


def _domain(values: list[float], *, inverted: bool) -> tuple[float, float] | None:
    """Bornes d'un axe, servies plutôt que cherchées à l'écran.

    `inverted` retourne l'axe pour une allure — basse veut dire rapide, et une courbe qui
    descend quand on accélère se lit à l'envers. Un volume, lui, se lit dans le sens
    habituel.

    Deux bornes égales donneraient une bande d'épaisseur nulle : on les écarte d'un
    centième, ce qui déplace l'échelle et non le point.
    """
    if len(values) < 2:
        return None
    low, high = min(values), max(values)
    if high - low < 0.01:
        low, high = low - 0.005, high + 0.005
    return (round(high, 4), round(low, 4)) if inverted else (round(low, 4), round(high, 4))


def _bands(ordered: list[Sortie]) -> list[Band]:
    """Le meilleur temps par bande de distance.

    **C'est la seule comparaison d'allures honnête de ce module.** À l'intérieur d'une
    bande, les sorties se ressemblent assez pour qu'un record veuille dire quelque chose ;
    entre deux bandes, il ne veut rien dire du tout.

    Une bande sans course reste dans la liste, à zéro : la faire disparaître donnerait à
    l'écran trois dispositions selon l'historique, et cacherait qu'on n'a jamais couru
    au-delà de dix kilomètres — ce qui est précisément une information.
    """
    bands: list[Band] = []
    for label, low, high in BANDS:
        inside = [
            item
            for item in ordered
            if item.distance_km >= low and (high is None or item.distance_km < high)
        ]
        if not inside:
            bands.append(Band(label=label))
            continue

        paced = [item for item in inside if item.pace_min_km]
        best = min(paced, key=lambda item: item.pace_min_km or 0.0) if paced else None
        bands.append(
            Band(
                label=label,
                runs=len(inside),
                best_pace_min_km=_round(best.pace_min_km, 3) if best else None,
                best_index=best.index if best else None,
                best_day=best.day if best else None,
                average_pace_min_km=_round(_pace_of(inside), 3),
                total_distance_km=round(sum(item.distance_km for item in inside), 2),
            )
        )
    return bands


def _months(ordered: list[Sortie]) -> list[Month]:
    """Le volume mois par mois, du plus ancien au plus récent.

    **Les mois sans course sont laissés hors de la liste**, et ce n'est pas un oubli : un
    mois à zéro inséré entre deux mois courus se lirait comme une mesure — « ce mois-là,
    zéro kilomètre » — alors qu'il dit surtout que l'application n'a rien enregistré. Un
    trou dans une courbe est plus honnête qu'un zéro inventé.
    """
    buckets: dict[str, list[Sortie]] = {}
    for item in ordered:
        buckets.setdefault(f"{item.day:%Y-%m}", []).append(item)

    return [
        Month(
            month=key,
            runs=len(group),
            distance_km=round(sum(item.distance_km for item in group), 2),
            minutes=round(sum(item.duration_min for item in group), 1),
            pace_min_km=_round(_pace_of(group), 3),
        )
        for key, group in sorted(buckets.items())
    ]


def _window(ordered: list[Sortie]) -> Window:
    """Les N dernières sorties contre les N précédentes.

    La fenêtre est la moitié de l'historique, plafonnée à cinq : sur douze courses on
    compare cinq contre cinq, sur six on compare trois contre trois, et sur trois on ne
    compare rien. Comparer une sortie à une sortie ferait dire à la dernière séance de
    fractionné que la forme s'est effondrée.
    """
    size = min(MAX_WINDOW, len(ordered) // 2)
    if size < MIN_WINDOW:
        return Window()

    recent, previous = ordered[-size:], ordered[-2 * size : -size]
    recent_pace, previous_pace = _pace_of(recent), _pace_of(previous)
    recent_distance = sum(item.distance_km for item in recent) / size
    previous_distance = sum(item.distance_km for item in previous) / size

    return Window(
        size=size,
        recent_pace_min_km=_round(recent_pace, 3),
        previous_pace_min_km=_round(previous_pace, 3),
        pace_delta_s_per_km=(
            round((recent_pace - previous_pace) * 60, 1)
            if recent_pace is not None and previous_pace is not None
            else None
        ),
        recent_distance_km=_round(recent_distance),
        previous_distance_km=_round(previous_distance),
        distance_delta_km=_round(recent_distance - previous_distance),
    )


# ── Meilleurs efforts et semaines (`docs/analyse-course.md`) ──


#: Semaines montrées par la courbe de volume. Douze tiennent sur 390 px sans que les barres
#: se touchent, et couvrent un cycle d'entraînement.
WEEKS = 12


@dataclass(frozen=True, slots=True)
class EffortInput:
    """Un meilleur effort rangé, rattaché à sa course par sa position et son jour."""

    index: int
    day: date
    distance_m: int
    duration_s: float


@dataclass(frozen=True, slots=True)
class EffortRecord:
    distance_m: int
    label: str
    duration_s: float
    pace_min_km: float
    day: date
    run: int
    runs: int


@dataclass(frozen=True, slots=True)
class EffortMark:
    day: date
    run: int
    duration_s: float
    pace_min_km: float
    record: bool


@dataclass(frozen=True, slots=True)
class EffortSeries:
    distance_m: int
    label: str
    marks: list[EffortMark]
    pace_domain_min_km: tuple[float, float] | None


@dataclass(frozen=True, slots=True)
class Week:
    week: date
    runs: int
    distance_km: float
    minutes: float


def _by_distance(efforts: list[EffortInput]) -> dict[int, list[EffortInput]]:
    grouped: dict[int, list[EffortInput]] = {}
    for effort in sorted(efforts, key=lambda item: (item.day, item.index)):
        grouped.setdefault(effort.distance_m, []).append(effort)
    return dict(sorted(grouped.items()))


def _pace(effort: EffortInput) -> float:
    return round(effort.duration_s / 60 / (effort.distance_m / 1000), 4)


def records(efforts: list[EffortInput], labels: dict[int, str]) -> list[EffortRecord]:
    """Le meilleur temps de l'historique sur chaque distance, la plus courte d'abord.

    **À égalité, le plus ancien garde le record** : le battre demande de faire mieux, pas
    aussi bien. C'est aussi ce qui empêche un record de changer de jour d'une lecture à
    l'autre selon l'ordre des lignes.
    """
    found: list[EffortRecord] = []
    for distance, group in _by_distance(efforts).items():
        best = min(group, key=lambda item: item.duration_s)
        found.append(
            EffortRecord(
                distance_m=distance,
                label=labels.get(distance, f"{distance} m"),
                duration_s=best.duration_s,
                pace_min_km=_pace(best),
                day=best.day,
                run=best.index,
                runs=len({item.index for item in group}),
            )
        )
    return found


def effort_series(efforts: list[EffortInput], labels: dict[int, str]) -> list[EffortSeries]:
    """La progression sur chaque distance courue au moins deux fois.

    `record` marque les efforts qui battaient **tout ce qui précédait** : c'est la
    lecture d'une progression, là où le record de l'historique ne dit que le sommet.
    """
    series: list[EffortSeries] = []
    for distance, group in _by_distance(efforts).items():
        if len(group) < 2:
            continue
        marks: list[EffortMark] = []
        best: float | None = None
        for effort in group:
            beaten = best is not None and effort.duration_s < best
            marks.append(
                EffortMark(
                    day=effort.day,
                    run=effort.index,
                    duration_s=effort.duration_s,
                    pace_min_km=_pace(effort),
                    record=beaten,
                )
            )
            best = effort.duration_s if best is None else min(best, effort.duration_s)
        series.append(
            EffortSeries(
                distance_m=distance,
                label=labels.get(distance, f"{distance} m"),
                marks=marks,
                pace_domain_min_km=_domain([mark.pace_min_km for mark in marks], inverted=True),
            )
        )
    return series


def weeks(sorties: list[Sortie], today: date, count: int = WEEKS) -> list[Week]:
    """Le volume des dernières semaines, **semaines vides comprises**.

    C'est l'inverse du choix de `_months`, et la différence tient à l'unité. Un mois vide
    entre deux mois courus disait surtout que l'application n'enregistrait pas encore ;
    une semaine vide au milieu d'un entraînement est **l'information** — la coupure qu'on
    vient chercher sur une courbe de volume. L'omettre dessinerait huit semaines contiguës
    là où il y en a eu douze, c'est-à-dire une régularité inventée.

    La courbe ne remonte pas avant la première sortie : des semaines vides **avant** qu'on
    ait commencé à courir ne diraient rien d'autre que la date d'installation.
    """
    if not sorties:
        return []
    current = today - timedelta(days=today.weekday())
    first = min(item.day for item in sorties)
    start = max(current - timedelta(weeks=count - 1), first - timedelta(days=first.weekday()))

    found: list[Week] = []
    monday = start
    while monday <= current:
        inside = [item for item in sorties if monday <= item.day < monday + timedelta(days=7)]
        found.append(
            Week(
                week=monday,
                runs=len(inside),
                distance_km=round(sum(item.distance_km for item in inside), 2),
                minutes=round(sum(item.duration_min for item in inside), 1),
            )
        )
        monday += timedelta(days=7)
    return found


def week_domain(found: list[Week]) -> tuple[float, float] | None:
    """Zéro en bas, toujours : un volume se lit depuis rien, et une barre de semaine vide
    doit toucher le sol plutôt que flotter à mi-hauteur."""
    if len(found) < 2:
        return None
    top = max(week.distance_km for week in found)
    return (0.0, round(top, 2)) if top > 0 else None
