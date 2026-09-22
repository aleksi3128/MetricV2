"""Ce qu'une sortie `.fit` dit de sa gestion (`docs/analyse-course.md`).

Module **pur**, comme `splits.py` et `progress.py` : il reçoit une sortie décodée, il rend
une structure. Aucun fichier, aucun modèle. Ce qui décide se teste sur des valeurs fixes ;
ce qui dessine se regarde.

## Une seule horloge : le chrono

Toute durée se lit sur `FitSample.timer_s`, l'horodatage moins les pauses du chronomètre.
Les **arrêts** chrono en marche — le feu rouge sans pause automatique — restent dans le
temps de chrono, parce qu'ils sont dans l'allure que la montre affiche ; ils sont retirés
de tout **jugement** d'allure (couleurs, phrases, zones), où ils feraient passer une
attente pour un coup de mou.

## Une seule abscisse : la distance

La courbe, le tracé et les couleurs partagent la même grille de points en mètres. C'est
ce qui permet à l'écran de montrer, sous le doigt posé sur la courbe, l'endroit du
parcours — sans qu'il ait rien à recaler.
"""

from __future__ import annotations

import bisect
import math
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from itertools import pairwise
from typing import Literal

from app.core.text import fr
from app.domains.activity import garmin
from app.domains.activity.fit import FitRun, FitSample

# ── Réglages de la lecture ────────────────────────────

#: Nombre de points au plus sur la grille. Trois cents suffisent à un dessin large de
#: 340 px : au-delà, deux points tombent dans le même pixel et la réponse grossit pour rien.
GRID_POINTS = 300
GRID_MIN_STEP_M = 10

#: Largeur de la fenêtre d'allure, centrée sur chaque point. Mesuré sur trois vraies
#: sorties : à 100 m, l'allure d'un 5 km régulier oscille de 21 s/km d'écart-type, soit du
#: bruit GPS ; à 200 m, 18 — et les coups d'accélérateur réels restent visibles.
PACE_WINDOW_M = 200.0
#: En deçà, la fenêtre ne mesure plus une allure mais la précision du GPS.
PACE_WINDOW_MIN_M = 50.0
ALTITUDE_WINDOW_M = 100.0

#: Part des valeurs écartées de chaque côté pour les bornes de l'axe. Un démarrage GPS à
#: 3:10/km ne doit pas tasser toute la courbe en haut du cadre.
DOMAIN_TRIM = 0.02

#: Tronçons des couleurs. Par tronçon et non par point : sur 100 m, l'allure du 11/09
#: changeait de couleur 81 fois en cinq kilomètres ; sur 250 m, quatre ou cinq.
CLASS_BIN_M = 250.0
CLASS_BINS_MAX = 40
CLASS_THRESHOLD_S = 10.0

#: Un arrêt, chrono en marche : quinze secondes sous 0,5 m/s. En deçà, c'est un
#: ralentissement ; au-dessus de ce seuil de vitesse, c'est de la marche.
STOP_SPEED_MS = 0.5
STOP_MIN_S = 15.0

#: Sous cette distance, aucune phrase : une moitié de 800 m ne dit rien de la gestion
#: d'une course.
INSIGHT_MIN_M = 1600.0
INSIGHTS_MAX = 5
FAST_START_S = 12.0
SLOW_START_S = 20.0
SLUMP_WINDOW_M = 500.0
SLUMP_S = 20.0
FINISH_WINDOW_M = 400.0
FINISH_S = 20.0
EVEN_SPLIT_S = 5.0
HR_DRIFT_PERCENT = 5.0
CADENCE_DRIFT_SPM = 4.0
#: Part minimale des points portant un relevé pour qu'une série existe. Une ceinture qui
#: décroche après dix minutes ne fait pas une course « avec cardio ».
COVERAGE = 0.6

#: Les seuils des constats **en watts** (`docs/coach-course.md` §3) : ceux de l'allure,
#: ramenés en proportion à 6:00/km — l'allure de footing du fichier de référence. Sur du
#: plat et sans vent, la puissance suit la vitesse ; un départ 12 s/km trop rapide à
#: 6:00/km l'est donc de 3,3 %, et le même départ se lit pareil en watts.
REFERENCE_PACE_S = 360.0
FAST_START_SHARE = FAST_START_S / REFERENCE_PACE_S
SLOW_START_SHARE = SLOW_START_S / REFERENCE_PACE_S
SLUMP_SHARE = SLUMP_S / REFERENCE_PACE_S
FINISH_SHARE = FINISH_S / REFERENCE_PACE_S
EVEN_SPLIT_SHARE = EVEN_SPLIT_S / REFERENCE_PACE_S
#: En deçà, des allures de kilomètre qui diffèrent sous une puissance égale ne disent rien
#: du terrain : c'est l'écart ordinaire d'un kilomètre à l'autre.
TERRAIN_PACE_SPREAD_S = 15.0

#: L'échauffement, retiré du découplage et de l'efficacité. La FC du 19/09 passe de 111 à
#: 160 en deux minutes : compter ces minutes-là dans la première moitié la ferait paraître
#: « efficace », et tout découplage s'en trouverait gonflé.
WARMUP_S = 600.0
#: Ce qu'il faut de sortie **après** l'échauffement pour comparer deux moitiés.
AEROBIC_MIN_S = 600.0

#: Le cadre vertical de la courbe de puissance : au moins ±15 % autour de la moyenne. Cadrée
#: sur son seul minimum et son maximum — 237 et 301 W le 19/09 —, une puissance tenue à
#: ±3 % remplissait toute la hauteur du dessin, et l'image disait « effort en dents de scie »
#: sous la phrase qui disait « effort constant ».
POWER_DOMAIN_MARGIN = 0.15

#: Ce qui fait d'une sortie un **effort à fond**, le seul où la plus haute FC relevée vaut
#: FC max (`docs/coach-course.md`, **C4**) : un effet anaérobie de 2,5 selon Garmin — un
#: fractionné, une fin de course lâchée —, ou un effort perçu de 9 et plus.
QUALIFYING_ANAEROBIC_TE = 2.5
QUALIFYING_RPE = 9


def qualifies(anaerobic_effect: float | None, rpe: int | None = None) -> bool:
    return (anaerobic_effect is not None and anaerobic_effect >= QUALIFYING_ANAEROBIC_TE) or (
        rpe is not None and rpe >= QUALIFYING_RPE
    )


#: En deçà, l'écart de foulée entre le premier et le dernier tiers est du bruit, et il ne
#: s'affiche pas. La sortie du 19/09 bouge d'une unité sur chaque mesure — un pas par minute, une milliseconde —,
#: ce qu'une estimation au poignet ne distingue pas du hasard ; la fatigue, elle, se lit en
#: dizaines de millisecondes de contact au sol et en plusieurs pas par minute.
STRIDE_NOISE = {"cadence": 2.0, "step": 0.02, "stance": 5.0, "oscillation": 0.3}

#: Les paliers de l'effet d'entraînement, tels que Garmin les nomme.
TRAINING_EFFECT_LABELS = (
    (1.0, "Aucun effet"),
    (2.0, "Léger"),
    (3.0, "Entretient"),
    (4.0, "Améliore"),
    (5.0, "Améliore beaucoup"),
)
TRAINING_EFFECT_TOP = "Surcharge"

#: Relief : le profil d'altitude n'est servi qu'au-delà (**A10**). 24 m sur 5 km est du
#: plat, et un profil de douze mètres d'amplitude ne dessinerait que le bruit du capteur.
RELIEF_MIN_ASCENT_M = 30
RELIEF_MIN_M_PER_KM = 5.0

#: Les distances des meilleurs efforts, et leur nom à l'écran.
EFFORTS: tuple[tuple[int, str], ...] = (
    (400, "400 m"),
    (1000, "1 km"),
    (3000, "3 km"),
    (5000, "5 km"),
    (10000, "10 km"),
    (21097, "Semi"),
    (42195, "Marathon"),
)

#: Riegel : `t₂ = t₁ × (d₂ ÷ d₁)^1,06`. L'exposant est celui de la publication de 1981,
#: et il est connu pour flatter les distances longues — ce qui est sans conséquence ici,
#: où l'on ne prédit qu'un effort d'une heure depuis des efforts de trois kilomètres et plus.
RIEGEL_EXPONENT = 1.06
#: Plus court, un effort extrapolé à une heure dit surtout la vitesse de pointe.
THRESHOLD_MIN_EFFORT_M = 3000
THRESHOLD_WINDOW_DAYS = 90

ZONE_NAMES = ("Récupération", "Endurance", "Tempo", "Seuil", "VO2 max")
#: Bornes des zones cardio, en part de la FC max.
HR_BOUNDS = (0.6, 0.7, 0.8, 0.9)
#: Bornes des zones d'allure, en part du **temps au kilomètre** de l'allure seuil : plus
#: la part est grande, plus on court lentement. Les cinq zones de course de Joe Friel,
#: resserrées de sept à cinq.
PACE_BOUNDS = (1.29, 1.14, 1.06, 0.99)

MONTHS = ("janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.",
          "nov.", "déc.")  # fmt: skip

PaceClass = Literal["faster", "even", "slower"]
Tone = Literal["good", "bad", "neutral"]
ZoneKind = Literal["heart_rate", "pace"]
ZoneSource = Literal["settings", "deduced", "watch"]


# ── Ce que le module rend ─────────────────────────────


@dataclass(frozen=True, slots=True)
class Point:
    """Un point de la grille : ce que la courbe dessine et ce que le tracé colore."""

    distance_km: float
    timer_s: float
    pace_min_km: float | None = None
    pace_class: PaceClass | None = None
    heart_rate: int | None = None
    cadence_spm: int | None = None
    power_w: int | None = None
    altitude_m: float | None = None
    #: Position normalisée sur le tracé, ou `None` sans GPS. Aucun degré ne sort d'ici.
    x: float | None = None
    y: float | None = None


@dataclass(frozen=True, slots=True)
class Stop:
    """`pause` : le chrono s'est arrêté. `stop` : il a continué, la course non."""

    kind: Literal["pause", "stop"]
    distance_km: float
    duration_s: float


@dataclass(frozen=True, slots=True)
class Insight:
    """Un constat, **rédigé ici**. L'écran l'affiche tel quel et ne décide sur rien."""

    code: str
    tone: Tone
    title: str
    text: str


@dataclass(frozen=True, slots=True)
class Effort:
    distance_m: int
    label: str
    duration_s: float
    pace_min_km: float
    start_km: float
    #: Vrai quand l'effort bat tous ceux des **autres** sorties à la même distance. Une
    #: première fois n'est pas un record : rien ne se compare à elle.
    record: bool = False


@dataclass(frozen=True, slots=True)
class ZoneReference:
    """Ce contre quoi les zones se lisent, et d'où cela vient (**A9**)."""

    kind: ZoneKind
    value: float
    source: ZoneSource
    detail: str


@dataclass(frozen=True, slots=True)
class ZoneBin:
    zone: int
    name: str
    range: str
    seconds: float
    share: float


@dataclass(frozen=True, slots=True)
class Zones:
    kind: ZoneKind
    reference_value: float
    source: ZoneSource
    detail: str
    bins: list[ZoneBin]
    summary: str


@dataclass(frozen=True, slots=True)
class Aerobic:
    """Le découplage et l'efficacité, échauffement retiré (`docs/coach-course.md` §3)."""

    #: `power` quand la puissance couvre la sortie, `pace` sinon.
    basis: Literal["power", "pace"]
    #: Part de puissance (ou de vitesse) par battement perdue d'une moitié à l'autre.
    #: Négative quand la seconde moitié a été plus efficace.
    decoupling_pct: float
    #: Vitesse en mètres par minute, divisée par la FC moyenne. Seule, elle ne dit rien ;
    #: sa tendance sur les sorties comparables dit la forme aérobie.
    efficiency: float
    #: La FC moyenne de chaque moitié **de la même fenêtre** : la phrase qui les cite ne
    #: peut pas prendre ses battements ailleurs que là où elle prend son découplage.
    heart_rate_first: int
    heart_rate_second: int


@dataclass(frozen=True, slots=True)
class GarminReadout:
    """Ce que la montre a calculé elle-même, **signé** à l'écran (**C5**)."""

    device: str | None = None
    vo2max: float | None = None
    training_effect_aerobic: float | None = None
    training_effect_aerobic_label: str | None = None
    training_effect_anaerobic: float | None = None
    training_effect_anaerobic_label: str | None = None
    training_load: int | None = None
    recovery_h: float | None = None
    performance_condition_start: int | None = None
    performance_condition_end: int | None = None
    stamina_start_pct: int | None = None
    stamina_end_pct: int | None = None


@dataclass(frozen=True, slots=True)
class StrideMeasure:
    """Une mesure de foulée : sa moyenne, et ce qu'elle a fait entre le premier et le
    dernier tiers de la sortie — la signature de la fatigue."""

    average: float
    #: Dernier tiers moins premier tiers, dans l'unité de la mesure.
    change: float | None = None


@dataclass(frozen=True, slots=True)
class Stride:
    #: `sensor` quand un capteur externe est déclaré, `wrist` sinon — et l'écran le dit.
    source: Literal["sensor", "wrist"]
    cadence_spm: StrideMeasure | None = None
    step_length_m: StrideMeasure | None = None
    stance_ms: StrideMeasure | None = None
    vertical_oscillation_cm: StrideMeasure | None = None
    vertical_ratio_pct: float | None = None


@dataclass(frozen=True, slots=True)
class Analysis:
    points: list[Point] = field(default_factory=list)
    located: bool = False
    width: float = 1.0
    height: float = 1.0
    distance_ticks_km: list[float] = field(default_factory=list)
    #: Le plus lent d'abord, comme toutes les bornes d'allure du domaine : c'est ainsi que
    #: l'axe se retourne sans que l'écran décide de son sens.
    pace_domain_min_km: tuple[float, float] | None = None
    pace_ticks_min_km: list[float] = field(default_factory=list)
    heart_rate_domain: tuple[int, int] | None = None
    cadence_domain: tuple[int, int] | None = None
    power_domain: tuple[int, int] | None = None
    altitude_domain_m: tuple[float, float] | None = None
    average_pace_min_km: float | None = None
    #: Servie seulement quand des arrêts chrono en marche l'écartent de la moyenne.
    moving_pace_min_km: float | None = None
    paused_s: float = 0.0
    stopped_s: float = 0.0
    stops: list[Stop] = field(default_factory=list)
    #: Le seuil des couleurs du tracé, servi pour que la légende ne l'écrive pas en dur.
    class_threshold_s: float = CLASS_THRESHOLD_S
    insights: list[Insight] = field(default_factory=list)
    efforts: list[Effort] = field(default_factory=list)
    zones: Zones | None = None
    #: Ce que coûte le prochain geste quand les zones manquent — jamais un tableau vide
    #: qui se lirait « zéro minute dans chaque zone ».
    zones_missing: str | None = None
    aerobic: Aerobic | None = None
    garmin: GarminReadout | None = None
    stride: Stride | None = None
    #: La puissance de séance telle que la montre l'a mesurée — la tuile du résumé.
    average_power_w: int | None = None
    normalized_power_w: int | None = None


# ── La ligne de temps ─────────────────────────────────


class Timeline:
    """Distance cumulée et temps de chrono, et de quoi passer de l'un à l'autre.

    La distance est rendue **croissante** par un maximum courant : un relevé qui recule
    d'un mètre — ça arrive au GPS — casserait toutes les interpolations qui suivent.
    """

    def __init__(self, samples: Sequence[FitSample]) -> None:
        self.samples = [item for item in samples if item.distance_m is not None]
        self.distances: list[float] = []
        self.times: list[float] = []
        reached = 0.0
        for item in self.samples:
            reached = max(reached, item.distance_m or 0.0)
            self.distances.append(reached)
            self.times.append(item.timer_s)

    @property
    def total_m(self) -> float:
        return self.distances[-1] if self.distances else 0.0

    def usable(self) -> bool:
        return len(self.distances) >= 2 and self.total_m > 0

    def time_at(self, distance: float) -> float:
        """Le temps de chrono auquel `distance` a été atteinte, interpolé."""
        distances, times = self.distances, self.times
        if distance <= distances[0]:
            return times[0]
        if distance >= distances[-1]:
            return times[bisect.bisect_left(distances, distances[-1])]
        index = bisect.bisect_left(distances, distance)
        before, after = distances[index - 1], distances[index]
        share = (distance - before) / (after - before) if after > before else 0.0
        return times[index - 1] + (times[index] - times[index - 1]) * share

    def distance_at(self, seconds: float) -> float:
        times, distances = self.times, self.distances
        if seconds <= times[0]:
            return distances[0]
        if seconds >= times[-1]:
            return distances[-1]
        index = bisect.bisect_left(times, seconds)
        before, after = times[index - 1], times[index]
        share = (seconds - before) / (after - before) if after > before else 0.0
        return distances[index - 1] + (distances[index] - distances[index - 1]) * share


class Series:
    """Une grandeur relevée le long de la distance, moyennable sur une fenêtre."""

    def __init__(self, pairs: Iterable[tuple[float, float]]) -> None:
        ordered = sorted(pairs)
        self.positions = [position for position, _ in ordered]
        self.sums = [0.0]
        for _, value in ordered:
            self.sums.append(self.sums[-1] + value)

    def __len__(self) -> int:
        return len(self.positions)

    def mean(self, low: float, high: float) -> float | None:
        start = bisect.bisect_left(self.positions, low)
        end = bisect.bisect_right(self.positions, high)
        if end <= start:
            return None
        return (self.sums[end] - self.sums[start]) / (end - start)


# ── Entrée ────────────────────────────────────────────


def analyse(
    run: FitRun,
    *,
    previous_bests: Mapping[int, float] | None = None,
    reference: ZoneReference | None = None,
    zones_missing: str | None = None,
) -> Analysis:
    """Tout ce que la page d'une sortie affiche d'un `.fit`.

    `previous_bests` : pour chaque distance d'effort, le meilleur temps **des autres
    sorties**. `reference` : ce contre quoi lire les zones, résolu par le service — qui
    seul connaît les réglages et l'historique.
    """
    line = Timeline(run.samples)
    if not line.usable():
        return Analysis(zones_missing=zones_missing)

    total = line.total_m
    stops = _stops(line, run)
    stationary = [stop for stop in stops if stop.kind == "stop"]
    stopped_s = sum(stop.duration_s for stop in stationary)
    duration_s = run.duration_min * 60

    average = run.duration_min / run.distance_km if run.distance_km > 0 else None
    moving = (
        (duration_s - stopped_s) / 60 / run.distance_km
        if stopped_s > 0 and run.distance_km > 0
        else None
    )
    # La référence des jugements : l'allure **en mouvement**. Un feu rouge ne doit pas
    # faire passer tout le reste de la sortie pour « plus rapide que ta moyenne ».
    judged = moving or average

    grid = _grid(total)
    paces = [_pace_around(line, distance, total) for distance in grid]
    classes = _classes(line, grid, total, stationary, judged)

    beats = _series(line.samples, lambda item: item.heart_rate)
    steps = _series(line.samples, lambda item: item.cadence_spm)
    watts = _series(line.samples, lambda item: item.power_w)
    heights = _series(line.samples, lambda item: item.altitude_m)
    has_hr = len(beats) >= COVERAGE * len(line.samples)
    has_cadence = len(steps) >= COVERAGE * len(line.samples)
    has_power = len(watts) >= COVERAGE * len(line.samples)
    relief = _has_relief(run, total) and len(heights) >= COVERAGE * len(line.samples)

    half = PACE_WINDOW_M / 2
    positions, width, height = _track(line, grid)
    points: list[Point] = []
    for index, distance in enumerate(grid):
        hr = beats.mean(distance - half, distance + half) if has_hr else None
        spm = steps.mean(distance - half, distance + half) if has_cadence else None
        power = watts.mean(distance - half, distance + half) if has_power else None
        altitude = (
            heights.mean(distance - ALTITUDE_WINDOW_M / 2, distance + ALTITUDE_WINDOW_M / 2)
            if relief
            else None
        )
        x, y = (positions[index][0], positions[index][1]) if positions else (None, None)
        pace = paces[index]
        points.append(
            Point(
                distance_km=round(distance / 1000, 3),
                timer_s=round(line.time_at(distance), 1),
                pace_min_km=round(pace, 4) if pace is not None else None,
                pace_class=classes[index],
                heart_rate=round(hr) if hr is not None else None,
                cadence_spm=round(spm) if spm is not None else None,
                power_w=round(power) if power is not None else None,
                altitude_m=round(altitude, 1) if altitude is not None else None,
                x=x,
                y=y,
            )
        )

    efforts = _mark_records(best_efforts(run), previous_bests or {})
    domain = _pace_domain(paces)
    effort = aerobic(run)
    zones = (
        _zones(line, grid, paces, points, stationary, reference) if reference is not None else None
    )

    return Analysis(
        points=points,
        located=bool(positions),
        width=width,
        height=height,
        distance_ticks_km=_distance_ticks(total),
        pace_domain_min_km=domain,
        pace_ticks_min_km=_pace_ticks(domain),
        heart_rate_domain=_int_domain([point.heart_rate for point in points]),
        cadence_domain=_int_domain([point.cadence_spm for point in points]),
        power_domain=_power_domain([point.power_w for point in points], run.metrics.avg_power_w),
        altitude_domain_m=_altitude_domain([point.altitude_m for point in points]),
        average_pace_min_km=round(average, 4) if average is not None else None,
        moving_pace_min_km=round(moving, 4) if moving is not None else None,
        paused_s=round(sum(pause.duration_s for pause in run.pauses), 1),
        stopped_s=round(stopped_s, 1),
        stops=stops,
        insights=_insights(
            line,
            total,
            stationary,
            stops,
            judged,
            efforts,
            points,
            has_hr,
            has_cadence,
            watts if has_power else None,
            effort,
        ),
        efforts=efforts,
        zones=zones,
        zones_missing=None if zones is not None else zones_missing,
        aerobic=effort,
        garmin=_garmin(run),
        stride=_stride(run, line),
        average_power_w=run.metrics.avg_power_w,
        normalized_power_w=run.metrics.normalized_power_w,
    )


# ── Grille et courbe ──────────────────────────────────


def _series(samples: Sequence[FitSample], read: Callable[[FitSample], float | None]) -> Series:
    pairs: list[tuple[float, float]] = []
    for item in samples:
        value = read(item)
        if value is not None and item.distance_m is not None:
            pairs.append((item.distance_m, float(value)))
    return Series(pairs)


def _grid(total: float) -> list[float]:
    """Les abscisses, au pas de `max(10 m, distance ÷ 300)` arrondi à 5 m.

    Le dernier point est la distance totale, même s'il tombe hors du pas : une courbe qui
    s'arrête vingt mètres avant l'arrivée ferait disparaître le finish qu'on vient voir.
    """
    step = max(GRID_MIN_STEP_M, math.ceil(total / GRID_POINTS / 5) * 5)
    grid = [float(step * index) for index in range(int(total // step) + 1)]
    if total - grid[-1] > 1:
        grid.append(total)
    return grid


def _pace_around(line: Timeline, distance: float, total: float) -> float | None:
    """L'allure de la fenêtre de 200 m centrée sur `distance`, en min/km.

    Aux deux bouts, la fenêtre glisse vers l'intérieur plutôt que de rétrécir : un
    premier point mesuré sur 100 m serait deux fois plus bruité que ses voisins.
    """
    low, high = distance - PACE_WINDOW_M / 2, distance + PACE_WINDOW_M / 2
    if low < 0:
        low, high = 0.0, min(total, PACE_WINDOW_M)
    if high > total:
        low, high = max(0.0, total - PACE_WINDOW_M), total
    if high - low < PACE_WINDOW_MIN_M:
        return None
    seconds = line.time_at(high) - line.time_at(low)
    return seconds / 60 / ((high - low) / 1000) if seconds > 0 else None


def _moving_seconds(line: Timeline, low: float, high: float, stationary: Sequence[Stop]) -> float:
    """Le chrono entre deux distances, **arrêts retirés**."""
    waited = sum(stop.duration_s for stop in stationary if low <= stop.distance_km * 1000 < high)
    return max(0.0, line.time_at(high) - line.time_at(low) - waited)


def _classes(
    line: Timeline,
    grid: Sequence[float],
    total: float,
    stationary: Sequence[Stop],
    judged: float | None,
) -> list[PaceClass | None]:
    """La couleur de chaque point : celle de son tronçon, contre l'allure en mouvement.

    Un reliquat de moins d'un demi-tronçon rejoint le précédent — cinquante mètres de
    finish ne méritent pas une couleur à eux seuls, et leur allure en dit plus sur le
    geste d'arrêter la montre que sur la course.
    """
    if judged is None:
        return [None] * len(grid)
    length = max(CLASS_BIN_M, total / CLASS_BINS_MAX)
    bounds = [length * index for index in range(int(total // length) + 1)]
    if total - bounds[-1] > length / 2 or len(bounds) == 1:
        bounds.append(total)
    else:
        bounds[-1] = total

    verdicts: list[PaceClass | None] = []
    for low, high in pairwise(bounds):
        seconds = _moving_seconds(line, low, high, stationary)
        if high - low <= 0 or seconds <= 0:
            verdicts.append(None)
            continue
        delta = (seconds / 60 / ((high - low) / 1000) - judged) * 60
        verdicts.append(
            "faster"
            if delta <= -CLASS_THRESHOLD_S
            else "slower"
            if delta >= CLASS_THRESHOLD_S
            else "even"
        )

    return [
        verdicts[min(bisect.bisect_right(bounds, distance) - 1, len(verdicts) - 1)]
        for distance in grid
    ]


def _has_relief(run: FitRun, total: float) -> bool:
    ascent = run.elevation_m or 0
    return (
        ascent >= RELIEF_MIN_ASCENT_M and ascent / max(total / 1000, 0.001) >= RELIEF_MIN_M_PER_KM
    )


# ── Arrêts ────────────────────────────────────────────


def _stops(line: Timeline, run: FitRun) -> list[Stop]:
    """Les pauses du chrono, et les arrêts chrono en marche, dans l'ordre de la distance."""
    found = [
        Stop(
            kind="pause",
            distance_km=round(line.distance_at(pause.timer_s) / 1000, 3),
            duration_s=pause.duration_s,
        )
        for pause in run.pauses
    ]

    waited = 0.0
    started: float | None = None
    distances, times = line.distances, line.times
    for index in range(1, len(distances)):
        elapsed = times[index] - times[index - 1]
        if elapsed <= 0:
            continue
        if (distances[index] - distances[index - 1]) / elapsed < STOP_SPEED_MS:
            if started is None:
                started = distances[index - 1]
            waited += elapsed
            continue
        if started is not None and waited >= STOP_MIN_S:
            found.append(Stop(kind="stop", distance_km=round(started / 1000, 3), duration_s=waited))
        started, waited = None, 0.0
    if started is not None and waited >= STOP_MIN_S:
        found.append(Stop(kind="stop", distance_km=round(started / 1000, 3), duration_s=waited))

    return sorted(found, key=lambda stop: stop.distance_km)


# ── Tracé ─────────────────────────────────────────────


def _track(line: Timeline, grid: Sequence[float]) -> tuple[list[tuple[float, float]], float, float]:
    """Les positions de la grille, projetées, cadrées, normalisées entre 0 et 1.

    **Rééchantillonné sur la grille de la courbe**, et non simplifié par Ramer–Douglas–
    Peucker comme avant ce lot : c'est ce qui donne à chaque point de la courbe sa place
    sur le tracé. À vingt mètres le pas sur un 5 km, un angle de rue perd au plus huit
    mètres — sous le pixel, sur un dessin de 340 px.
    """
    lats: list[tuple[float, float]] = []
    lons: list[tuple[float, float]] = []
    for item in line.samples:
        if item.lat is not None and item.lon is not None and item.distance_m is not None:
            lats.append((item.distance_m, item.lat))
            lons.append((item.distance_m, item.lon))
    if len(lats) < 2:
        return [], 1.0, 1.0
    lat_at = _interpolator(lats)
    lon_at = _interpolator(lons)

    degrees = [(lat_at(distance), lon_at(distance)) for distance in grid]
    # Projection équirectangulaire : un degré de longitude raccourcit avec la latitude —
    # d'un quart à 43°. Sans le cosinus, une boucle carrée s'afficherait en rectangle.
    mean_lat = sum(lat for lat, _ in degrees) / len(degrees)
    cosine = max(math.cos(math.radians(mean_lat)), 0.01)
    projected = [(lon * cosine, lat) for lat, lon in degrees]

    xs = [x for x, _ in projected]
    ys = [y for _, y in projected]
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    if span <= 0:
        return [], 1.0, 1.0

    # L'axe vertical d'un SVG descend : on retourne pour que le nord soit en haut.
    normalized = [
        (round((x - min(xs)) / span, 4), round((max(ys) - y) / span, 4)) for x, y in projected
    ]
    return (
        normalized,
        round((max(xs) - min(xs)) / span, 4) or 0.0001,
        round((max(ys) - min(ys)) / span, 4) or 0.0001,
    )


def _interpolator(pairs: Sequence[tuple[float, float]]) -> Callable[[float], float]:
    positions = [position for position, _ in pairs]
    values = [value for _, value in pairs]

    def at(distance: float) -> float:
        if distance <= positions[0]:
            return values[0]
        if distance >= positions[-1]:
            return values[-1]
        index = bisect.bisect_left(positions, distance)
        before, after = positions[index - 1], positions[index]
        share = (distance - before) / (after - before) if after > before else 0.0
        return values[index - 1] + (values[index] - values[index - 1]) * share

    return at


# ── Axes ──────────────────────────────────────────────


def _distance_ticks(total: float) -> list[float]:
    """Des kilomètres ronds, six au plus."""
    km = total / 1000
    for step in (0.2, 0.5, 1, 2, 5, 10, 20):
        if km / step <= 6:
            return [round(step * index, 1) for index in range(int(km // step) + 1)]
    return [0.0]


def _pace_domain(paces: Sequence[float | None]) -> tuple[float, float] | None:
    values = sorted(value for value in paces if value is not None)
    if len(values) < 2:
        return None
    cut = int(len(values) * DOMAIN_TRIM)
    fast, slow = values[cut], values[len(values) - 1 - cut]
    pad = max((slow - fast) * 0.08, 5 / 60)
    return round(slow + pad, 4), round(max(fast - pad, 0.5), 4)


def _pace_ticks(domain: tuple[float, float] | None) -> list[float]:
    """Deux à quatre graduations à la seconde ronde, dans le cadre."""
    if domain is None:
        return []
    slow, fast = domain
    for seconds in (5, 10, 15, 20, 30, 60, 120, 300):
        step = seconds / 60
        first = math.ceil(fast / step) * step
        ticks = []
        value = first
        while value <= slow + 1e-9:
            ticks.append(round(value, 4))
            value += step
        if len(ticks) <= 4:
            return ticks
    return []


def _int_domain(values: Sequence[int | None]) -> tuple[int, int] | None:
    present = [value for value in values if value is not None]
    if len(present) < 2:
        return None
    return min(present), max(present)


def _power_domain(values: Sequence[int | None], average: int | None) -> tuple[int, int] | None:
    domain = _int_domain(values)
    present = [value for value in values if value is not None]
    centre = average or (sum(present) / len(present) if present else None)
    if domain is None or centre is None:
        return domain
    return (
        min(domain[0], math.floor(centre * (1 - POWER_DOMAIN_MARGIN))),
        max(domain[1], math.ceil(centre * (1 + POWER_DOMAIN_MARGIN))),
    )


def _altitude_domain(values: Sequence[float | None]) -> tuple[float, float] | None:
    present = [value for value in values if value is not None]
    if len(present) < 2:
        return None
    return round(min(present), 1), round(max(present), 1)


# ── Meilleurs efforts ─────────────────────────────────


def best_efforts(run: FitRun) -> list[Effort]:
    """Le chrono le plus court pour couvrir chaque distance, où qu'elle commence.

    Aucun effort sur un enregistrement troué : le meilleur kilomètre serait celui qui
    enjambe le trou, et l'on ne sait pas ce qui s'y est couru.
    """
    if run.has_gap:
        return []
    line = Timeline(run.samples)
    if not line.usable():
        return []

    found: list[Effort] = []
    distances, times = line.distances, line.times
    for target, label in EFFORTS:
        if line.total_m < target:
            break
        best: tuple[float, float] | None = None
        for index, start in enumerate(distances):
            if start + target > line.total_m:
                break
            seconds = line.time_at(start + target) - times[index]
            if seconds > 0 and (best is None or seconds < best[0]):
                best = (seconds, start)
        if best is not None:
            found.append(
                Effort(
                    distance_m=target,
                    label=label,
                    duration_s=round(best[0], 1),
                    pace_min_km=round(best[0] / 60 / (target / 1000), 4),
                    start_km=round(best[1] / 1000, 3),
                )
            )
    return found


def _mark_records(efforts: list[Effort], previous: Mapping[int, float]) -> list[Effort]:
    return [
        Effort(
            distance_m=effort.distance_m,
            label=effort.label,
            duration_s=effort.duration_s,
            pace_min_km=effort.pace_min_km,
            start_km=effort.start_km,
            record=effort.distance_m in previous
            and effort.duration_s < previous[effort.distance_m],
        )
        for effort in efforts
    ]


def label_of(distance_m: int) -> str:
    return next((label for target, label in EFFORTS if target == distance_m), f"{distance_m} m")


# ── Zones ─────────────────────────────────────────────


def zone_kind(run: FitRun) -> ZoneKind:
    """Cardio si le fichier en porte assez, allure sinon (**A8**)."""
    measured = [item for item in run.samples if item.distance_m is not None]
    beats = sum(1 for item in measured if item.heart_rate is not None)
    return "heart_rate" if measured and beats >= COVERAGE * len(measured) else "pace"


def deduce_threshold(
    efforts: Iterable[tuple[date, int, float]], today: date
) -> tuple[float, date, int] | None:
    """L'allure seuil **estimée** : celle d'un effort d'une heure, prédite par Riegel.

    Depuis chaque meilleur effort de trois kilomètres et plus des 90 derniers jours, on
    garde la prédiction la plus rapide — un effort facile sous-estime la forme, jamais
    l'inverse. Rend l'allure, le jour et la distance de l'effort qui l'a donnée.
    """
    since = today - timedelta(days=THRESHOLD_WINDOW_DAYS)
    best: tuple[float, date, int] | None = None
    for day, distance_m, seconds in efforts:
        if distance_m < THRESHOLD_MIN_EFFORT_M or seconds <= 0 or day < since:
            continue
        hour_m = distance_m * (3600 / seconds) ** (1 / RIEGEL_EXPONENT)
        pace = 60 / (hour_m / 1000)
        if best is None or pace < best[0]:
            best = (round(pace, 4), day, distance_m)
    return best


def _zones(
    line: Timeline,
    grid: Sequence[float],
    paces: Sequence[float | None],
    points: Sequence[Point],
    stationary: Sequence[Stop],
    reference: ZoneReference,
) -> Zones | None:
    """Le temps passé dans chaque zone, arrêts retirés.

    Chaque tronçon de la grille compte son temps de chrono dans la zone de son allure
    lissée — ou de sa fréquence cardiaque. Brute sur vingt mètres, l'allure sauterait
    d'une zone à l'autre au rythme du bruit GPS.
    """
    seconds = [0.0] * 5
    for index in range(len(grid) - 1):
        spent = _moving_seconds(line, grid[index], grid[index + 1], stationary)
        if spent <= 0:
            continue
        if reference.kind == "heart_rate":
            beat = points[index].heart_rate
            if beat is None:
                continue
            ratio = beat / reference.value
            zone = sum(1 for bound in HR_BOUNDS if ratio >= bound)
        else:
            pace = paces[index]
            if pace is None:
                continue
            ratio = pace / reference.value
            zone = sum(1 for bound in PACE_BOUNDS if ratio < bound)
        seconds[zone] += spent

    counted = sum(seconds)
    if counted <= 0:
        return None

    bins = [
        ZoneBin(
            zone=index + 1,
            name=ZONE_NAMES[index],
            range=_zone_range(reference, index),
            seconds=round(seconds[index], 1),
            share=round(seconds[index] / counted, 4),
        )
        for index in range(5)
    ]
    dominant = max(bins, key=lambda item: item.seconds)
    return Zones(
        kind=reference.kind,
        reference_value=reference.value,
        source=reference.source,
        detail=reference.detail,
        bins=bins,
        summary=f"{round(dominant.share * 100)} % du temps en zone {dominant.zone}, "
        f"{dominant.name}.",
    )


def _zone_range(reference: ZoneReference, index: int) -> str:
    if reference.kind == "heart_rate":
        edges = [round(reference.value * bound) for bound in HR_BOUNDS]
        if index == 0:
            return f"< {edges[0]} bpm"
        if index == 4:
            return f"≥ {edges[3]} bpm"
        return f"{edges[index - 1]}–{edges[index] - 1} bpm"

    edges_pace = [reference.value * bound for bound in PACE_BOUNDS]
    if index == 0:
        return f"> {clock(edges_pace[0])} /km"
    if index == 4:
        return f"< {clock(edges_pace[3])} /km"
    return f"{clock(edges_pace[index])}–{clock(edges_pace[index - 1])} /km"


# ── Phrases ───────────────────────────────────────────


def _insights(
    line: Timeline,
    total: float,
    stationary: Sequence[Stop],
    stops: Sequence[Stop],
    judged: float | None,
    efforts: Sequence[Effort],
    points: Sequence[Point],
    has_hr: bool,
    has_cadence: bool,
    watts: Series | None = None,
    effort: Aerobic | None = None,
) -> list[Insight]:
    """Cinq constats au plus, du plus utile au moins utile (`docs/analyse-course.md` §3).

    **Sur l'effort quand la puissance le mesure.** Le 19/09, l'allure juge un « départ trop
    rapide », un « coup de mou » et une « seconde moitié plus lente », et la puissance
    reste entre 250 et 253 W d'un bout à l'autre : c'est le terrain qui a bougé le chrono.
    Les quatre constats de gestion se lisent alors en watts (`_power_insights`).
    """
    if total < INSIGHT_MIN_M or judged is None:
        return []

    def pace_between(low: float, high: float) -> float | None:
        spent = _moving_seconds(line, low, high, stationary)
        return spent / 60 / ((high - low) / 1000) if high > low and spent > 0 else None

    found: list[Insight] = []
    if watts is not None:
        found.extend(_power_insights(watts, total, pace_between))
    else:
        found.extend(_pace_insights(total, judged, pace_between))
    first_half, second_half = pace_between(0, total / 2), pace_between(total / 2, total)

    # Le record : le plus long battu, un seul — trois phrases de records se liraient comme
    # une liste, et la liste est déjà dans la carte des efforts.
    records = [effort for effort in efforts if effort.record]
    if records:
        top = max(records, key=lambda effort: effort.distance_m)
        found.append(
            Insight(
                code="record",
                tone="good",
                title=f"Record sur {top.label}",
                # « 4:41, soit 4:41 au kilomètre » : sur un kilomètre, l'allure est le temps.
                text=(
                    f"{clock(top.duration_s / 60)}, à partir du km {km(top.start_km * 1000)}."
                    if top.distance_m == 1000
                    else f"{clock(top.duration_s / 60)}, soit {clock(top.pace_min_km)} au "
                    f"kilomètre, à partir du km {km(top.start_km * 1000)}."
                ),
            )
        )

    # Le cardio : le découplage, échauffement retiré, dès qu'il se mesure — sur la
    # puissance si elle couvre la sortie. Sinon l'ancienne lecture sur les deux moitiés
    # entières, pour les sorties trop courtes pour retirer dix minutes.
    if has_hr and effort is not None:
        found.append(_decoupling_insight(effort))
    elif has_hr:
        halves = _halves(points, total, "heart_rate")
        if halves is not None and first_half and second_half:
            hr1, hr2 = halves
            # Vitesse par battement : 1 ÷ (allure × FC). Elle baisse quand le cœur accélère
            # à allure égale — c'est le découplage que tout coureur d'endurance surveille.
            drift = (1 - (first_half * hr1) / (second_half * hr2)) * 100
            if drift >= HR_DRIFT_PERCENT:
                found.append(
                    Insight(
                        code="hr_drift",
                        tone="bad",
                        title="Dérive cardiaque",
                        text=f"{fr(drift)} % de vitesse par battement perdus entre les deux "
                        f"moitiés ({round(hr1)} puis {round(hr2)} bpm).",
                    )
                )
            else:
                found.append(
                    Insight(
                        code="hr_drift",
                        tone="good",
                        title="Cardio stable",
                        text=f"{round(hr1)} puis {round(hr2)} bpm : l'effort est resté "
                        "sous contrôle d'une moitié à l'autre.",
                    )
                )

    # La foulée.
    if has_cadence:
        halves = _halves(points, total, "cadence_spm")
        if halves is not None and halves[1] - halves[0] <= -CADENCE_DRIFT_SPM:
            found.append(
                Insight(
                    code="cadence_drop",
                    tone="bad",
                    title="Foulée moins fréquente",
                    text=f"{round(halves[0])} puis {round(halves[1])} pas par minute : la "
                    "fatigue raccourcit souvent la foulée avant l'allure.",
                )
            )

    # Les arrêts, en dernier : un constat, pas un jugement.
    if stops:
        paused = [stop for stop in stops if stop.kind == "pause"]
        waited = [stop for stop in stops if stop.kind == "stop"]
        parts: list[str] = []
        if paused:
            parts.append(
                f"chrono arrêté {clock(sum(stop.duration_s for stop in paused) / 60)} "
                f"({_places(paused)}), sans effet sur ton allure"
            )
        if waited:
            parts.append(
                f"chrono en marche {clock(sum(stop.duration_s for stop in waited) / 60)} "
                f"({_places(waited)}), compté dans ton allure"
            )
        count = len(stops)
        found.append(
            Insight(
                code="stops",
                tone="neutral",
                title=f"{count} arrêt{'s' if count > 1 else ''}",
                text=f"{'. '.join(part[0].upper() + part[1:] for part in parts)}.",
            )
        )

    return found[:INSIGHTS_MAX]


def _pace_insights(
    total: float, judged: float, pace_between: Callable[[float, float], float | None]
) -> list[Insight]:
    """Départ, coup de mou, moitiés, finish — **sur l'allure**, faute de puissance."""
    found: list[Insight] = []

    # Le départ.
    if total >= 3000:
        first, rest = pace_between(0, 1000), pace_between(1000, total)
        if first is not None and rest is not None:
            delta = (first - rest) * 60
            if delta <= -FAST_START_S:
                found.append(
                    Insight(
                        code="fast_start",
                        tone="bad",
                        title="Départ trop rapide",
                        text=f"Premier kilomètre en {clock(first)}, {whole_seconds(-delta)} s/km plus "
                        f"vite que la suite ({clock(rest)}).",
                    )
                )
            elif delta >= SLOW_START_S:
                found.append(
                    Insight(
                        code="slow_start",
                        tone="neutral",
                        title="Départ en douceur",
                        text=f"Premier kilomètre en {clock(first)}, {whole_seconds(delta)} s/km plus "
                        f"lent que la suite : un échauffement.",
                    )
                )

    # Le coup de mou : les 500 m les plus lents, hors départ et hors finish.
    if total >= 2000:
        worst: tuple[float, float] | None = None
        low = SLUMP_WINDOW_M
        step = max(10.0, total / GRID_POINTS)
        while low + SLUMP_WINDOW_M <= total - 200:
            pace = pace_between(low, low + SLUMP_WINDOW_M)
            if pace is not None and (worst is None or pace > worst[0]):
                worst = (pace, low)
            low += step
        if worst is not None and (worst[0] - judged) * 60 >= SLUMP_S:
            found.append(
                Insight(
                    code="slump",
                    tone="bad",
                    title="Coup de mou",
                    text=f"Du km {km(worst[1])} au km {km(worst[1] + SLUMP_WINDOW_M)} à "
                    f"{clock(worst[0])}, {whole_seconds((worst[0] - judged) * 60)} s/km plus lent "
                    "que ta moyenne.",
                )
            )

    # Les deux moitiés.
    first_half, second_half = pace_between(0, total / 2), pace_between(total / 2, total)
    if first_half is not None and second_half is not None:
        delta = (second_half - first_half) * 60
        both = f"{clock(first_half)} puis {clock(second_half)} au kilomètre"
        if abs(delta) < EVEN_SPLIT_S:
            found.append(Insight(code="split", tone="good", title="Allure tenue", text=f"{both}."))
        elif delta < 0:
            found.append(
                Insight(
                    code="split",
                    tone="good",
                    title="Seconde moitié plus rapide",
                    text=f"{both} : {whole_seconds(-delta)} s/km de gagnées.",
                )
            )
        else:
            found.append(
                Insight(
                    code="split",
                    tone="bad",
                    title="Seconde moitié plus lente",
                    text=f"{both} : {whole_seconds(delta)} s/km de perdues.",
                )
            )

    # Le finish.
    if total >= 2000:
        finish = pace_between(total - FINISH_WINDOW_M, total)
        if finish is not None and (finish - judged) * 60 <= -FINISH_S:
            found.append(
                Insight(
                    code="finish",
                    tone="good",
                    title="Finish rapide",
                    text=f"400 derniers mètres en {clock(finish)}, "
                    f"{whole_seconds((judged - finish) * 60)} s/km plus vite que ta moyenne.",
                )
            )

    return found


def _power_insights(
    watts: Series, total: float, pace_between: Callable[[float, float], float | None]
) -> list[Insight]:
    """Départ, coup de mou, moitiés, finish — **en watts**, et le terrain quand l'allure
    a bougé sous un effort constant."""
    found: list[Insight] = []
    average = watts.mean(0, total)
    if average is None or average <= 0:
        return found

    def share(value: float, against: float) -> str:
        return fr(round(abs(value / against - 1) * 100, 1))

    steady_start = True
    if total >= 3000:
        first, rest = watts.mean(0, 1000), watts.mean(1000, total)
        if first is not None and rest is not None and rest > 0:
            if first >= rest * (1 + FAST_START_SHARE):
                steady_start = False
                found.append(
                    Insight(
                        code="fast_start",
                        tone="bad",
                        title="Départ trop appuyé",
                        text=f"Premier kilomètre à {round(first)} W, {share(first, rest)} % "
                        f"au-dessus de la suite ({round(rest)} W).",
                    )
                )
            elif first <= rest * (1 - SLOW_START_SHARE):
                steady_start = False
                found.append(
                    Insight(
                        code="slow_start",
                        tone="neutral",
                        title="Départ en douceur",
                        text=f"Premier kilomètre à {round(first)} W, {share(first, rest)} % "
                        f"sous la suite\u00a0: un échauffement.",
                    )
                )

    no_slump = True
    if total >= 2000:
        worst: tuple[float, float] | None = None
        low = SLUMP_WINDOW_M
        step = max(10.0, total / GRID_POINTS)
        while low + SLUMP_WINDOW_M <= total - 200:
            value = watts.mean(low, low + SLUMP_WINDOW_M)
            if value is not None and (worst is None or value < worst[0]):
                worst = (value, low)
            low += step
        if worst is not None and worst[0] <= average * (1 - SLUMP_SHARE):
            no_slump = False
            found.append(
                Insight(
                    code="slump",
                    tone="bad",
                    title="Coup de mou",
                    text=f"Du km {km(worst[1])} au km {km(worst[1] + SLUMP_WINDOW_M)} à "
                    f"{round(worst[0])} W, {share(worst[0], average)} % sous ta moyenne.",
                )
            )

    even = False
    first_half, second_half = watts.mean(0, total / 2), watts.mean(total / 2, total)
    if first_half is not None and second_half is not None and first_half > 0:
        both = f"{round(first_half)} puis {round(second_half)} W d'une moitié à l'autre"
        change = second_half / first_half - 1
        if abs(change) < EVEN_SPLIT_SHARE:
            even = True
            found.append(Insight(code="split", tone="good", title="Effort tenu", text=f"{both}."))
        elif change > 0:
            found.append(
                Insight(
                    code="split",
                    tone="good",
                    title="Seconde moitié plus appuyée",
                    text=f"{both}\u00a0: {fr(round(change * 100, 1))} % de plus.",
                )
            )
        else:
            found.append(
                Insight(
                    code="split",
                    tone="bad",
                    title="Seconde moitié moins appuyée",
                    text=f"{both}\u00a0: {fr(round(-change * 100, 1))} % de moins.",
                )
            )

    if total >= 2000:
        finish = watts.mean(total - FINISH_WINDOW_M, total)
        if finish is not None and finish >= average * (1 + FINISH_SHARE):
            found.append(
                Insight(
                    code="finish",
                    tone="good",
                    title="Finish appuyé",
                    text=f"400 derniers mètres à {round(finish)} W, "
                    f"{share(finish, average)} % au-dessus de ta moyenne.",
                )
            )

    # Le terrain : un effort égal, et des kilomètres qui ne se ressemblent pas. C'est la
    # phrase que la sortie du 19/09 aurait dû lire, là où l'allure en lisait trois fausses.
    if steady_start and no_slump and even:
        kilometres = [
            (watts.mean(start, start + 1000), pace_between(start, start + 1000))
            for start in range(0, int(total // 1000) * 1000, 1000)
        ]
        measured = [(w, p) for w, p in kilometres if w is not None and p is not None]
        if len(measured) >= 3:
            paces = [p for _, p in measured]
            if (max(paces) - min(paces)) * 60 >= TERRAIN_PACE_SPREAD_S:
                powers = [w for w, _ in measured]
                found.append(
                    Insight(
                        code="terrain",
                        tone="neutral",
                        title="Allure variable, effort constant",
                        text=f"Entre {round(min(powers))} et {round(max(powers))} W au "
                        f"kilomètre, pour des allures de {clock(min(paces))} à "
                        f"{clock(max(paces))}\u00a0: le terrain ou le vent, pas la gestion.",
                    )
                )
    return found


def _decoupling_insight(effort: Aerobic) -> Insight:
    what = "Puissance" if effort.basis == "power" else "Vitesse"
    beats = f" ({effort.heart_rate_first} puis {effort.heart_rate_second} bpm)"
    if effort.decoupling_pct >= HR_DRIFT_PERCENT:
        return Insight(
            code="hr_drift",
            tone="bad",
            title="Dérive cardiaque",
            text=f"{what} par battement\u00a0: {fr(effort.decoupling_pct)} % de perdus entre les "
            f"deux moitiés, échauffement exclu{beats}.",
        )
    kept = (
        f"{fr(effort.decoupling_pct)} % de perdus" if effort.decoupling_pct > 0 else "rien de perdu"
    )
    return Insight(
        code="hr_drift",
        tone="good",
        title="Cardio stable",
        text=f"{what} par battement\u00a0: {kept} entre les deux moitiés, échauffement exclu{beats}.",
    )


def _halves(
    points: Sequence[Point], total: float, name: Literal["heart_rate", "cadence_spm"]
) -> tuple[float, float] | None:
    middle = total / 2000
    first = [getattr(p, name) for p in points if p.distance_km < middle and getattr(p, name)]
    second = [getattr(p, name) for p in points if p.distance_km >= middle and getattr(p, name)]
    if not first or not second:
        return None
    return sum(first) / len(first), sum(second) / len(second)


def _places(stops: Sequence[Stop]) -> str:
    return ", ".join(f"km {km(stop.distance_km * 1000)}" for stop in stops)


# ── Découplage, efficacité ────────────────────────────


def aerobic(run: FitRun) -> Aerobic | None:
    """Le découplage et l'efficacité, sur ce qui suit les dix premières minutes.

    Deux moitiés **de temps**, pas de distance : c'est la dérive du cœur au fil des minutes
    qu'on cherche, et une moitié de distance courue plus vite durerait moins. Sans cardio
    sur l'essentiel de la sortie, ou avec moins de dix minutes après l'échauffement, rien.
    """
    moving = [
        item
        for item in run.samples
        if item.timer_s >= WARMUP_S and item.heart_rate is not None and item.distance_m is not None
    ]
    measured = [item for item in run.samples if item.distance_m is not None]
    if not measured or len(moving) < COVERAGE * max(
        1, sum(1 for item in measured if item.timer_s >= WARMUP_S)
    ):
        return None
    if moving[-1].timer_s - moving[0].timer_s < AEROBIC_MIN_S:
        return None

    powered = sum(1 for item in moving if item.power_w is not None) >= COVERAGE * len(moving)
    middle = (moving[0].timer_s + moving[-1].timer_s) / 2
    halves = [
        [item for item in moving if item.timer_s < middle],
        [item for item in moving if item.timer_s >= middle],
    ]

    def per_beat(part: Sequence[FitSample]) -> float | None:
        beats = sum(item.heart_rate or 0 for item in part) / len(part)
        if powered:
            watts = [item.power_w for item in part if item.power_w is not None]
            return sum(watts) / len(watts) / beats if watts and beats else None
        span = part[-1].timer_s - part[0].timer_s
        covered = (part[-1].distance_m or 0.0) - (part[0].distance_m or 0.0)
        return covered / span / beats if span > 0 and beats else None

    first, second = per_beat(halves[0]), per_beat(halves[1])
    if not halves[0] or not halves[1] or not first or second is None:
        return None

    span_min = (moving[-1].timer_s - moving[0].timer_s) / 60
    covered_m = (moving[-1].distance_m or 0.0) - (moving[0].distance_m or 0.0)
    beats = sum(item.heart_rate or 0 for item in moving) / len(moving)
    return Aerobic(
        basis="power" if powered else "pace",
        decoupling_pct=round((1 - second / first) * 100, 1),
        efficiency=round(covered_m / span_min / beats, 3) if span_min > 0 and beats else 0.0,
        heart_rate_first=round(sum(item.heart_rate or 0 for item in halves[0]) / len(halves[0])),
        heart_rate_second=round(sum(item.heart_rate or 0 for item in halves[1]) / len(halves[1])),
    )


# ── Ce que la montre ajoute ───────────────────────────


def training_effect_label(value: float | None) -> str | None:
    if value is None:
        return None
    for below, label in TRAINING_EFFECT_LABELS:
        if value < below:
            return label
    return TRAINING_EFFECT_TOP


def _garmin(run: FitRun) -> GarminReadout | None:
    """Ce que la montre a calculé. Un champ non documenté ne sort qu'une fois sa lecture
    confirmée sur Garmin Connect (`garmin.CONFIRMED`)."""
    metrics = run.metrics
    condition = garmin.confirmed(garmin.PERFORMANCE_CONDITION)
    stamina = garmin.confirmed(garmin.STAMINA)
    readout = GarminReadout(
        device=metrics.device,
        vo2max=metrics.vo2max if garmin.confirmed(garmin.VO2MAX) else None,
        training_effect_aerobic=metrics.training_effect_aerobic,
        training_effect_aerobic_label=training_effect_label(metrics.training_effect_aerobic),
        training_effect_anaerobic=metrics.training_effect_anaerobic,
        training_effect_anaerobic_label=training_effect_label(metrics.training_effect_anaerobic),
        training_load=metrics.training_load,
        recovery_h=metrics.recovery_h if garmin.confirmed(garmin.RECOVERY) else None,
        performance_condition_start=metrics.performance_condition_start if condition else None,
        performance_condition_end=metrics.performance_condition_end if condition else None,
        stamina_start_pct=metrics.stamina_start_pct if stamina else None,
        stamina_end_pct=metrics.stamina_end_pct if stamina else None,
    )
    # Un téléphone n'en porte rien : pas de carte vide qui se lirait « Garmin n'a rien vu ».
    measured = (
        readout.vo2max,
        readout.training_effect_aerobic,
        readout.training_load,
        readout.recovery_h,
        readout.performance_condition_end,
        readout.stamina_end_pct,
    )
    return readout if any(value is not None for value in measured) else None


def _stride(run: FitRun, line: Timeline) -> Stride | None:
    """La foulée : moyenne de séance, et l'écart du dernier tiers au premier."""
    samples = [item for item in line.samples if item.timer_s >= 0]
    if not samples:
        return None
    third = samples[-1].timer_s / 3

    def measure(
        read: Callable[[FitSample], float | None], digits: int, noise: float
    ) -> StrideMeasure | None:
        values = [(item.timer_s, read(item)) for item in samples]
        present = [(moment, value) for moment, value in values if value is not None]
        if len(present) < COVERAGE * len(samples):
            return None
        early = [value for moment, value in present if moment < third]
        late = [value for moment, value in present if moment >= 2 * third]
        average = sum(value for _, value in present) / len(present)
        change = (
            round(sum(late) / len(late) - sum(early) / len(early), digits)
            if early and late
            else None
        )
        if change is not None and abs(change) < noise:
            change = None
        return StrideMeasure(average=round(average, digits), change=change)

    stride = Stride(
        source="sensor" if run.metrics.external_sensor else "wrist",
        cadence_spm=measure(lambda item: item.cadence_spm, 0, STRIDE_NOISE["cadence"]),
        step_length_m=measure(lambda item: item.step_length_m, 2, STRIDE_NOISE["step"]),
        stance_ms=measure(lambda item: item.stance_ms, 0, STRIDE_NOISE["stance"]),
        vertical_oscillation_cm=measure(
            lambda item: item.vertical_oscillation_cm, 1, STRIDE_NOISE["oscillation"]
        ),
        vertical_ratio_pct=run.metrics.avg_vertical_ratio_pct,
    )
    # La cadence seule est déjà sur la courbe : la carte ne sort que si la montre a
    # mesuré la foulée elle-même.
    return stride if stride.stance_ms or stride.step_length_m else None


# ── Écriture française ────────────────────────────────


def clock(minutes: float) -> str:
    """`5.2667` → `5:16`, `78.73` → `1:18:44`. La forme de `format.ts` à l'écran, pour
    qu'une phrase et la tuile d'à côté écrivent le même chiffre de la même façon."""
    total = round(minutes * 60)
    hours, rest = divmod(total, 3600)
    mins, secs = divmod(rest, 60)
    return f"{hours}:{mins:02d}:{secs:02d}" if hours else f"{mins}:{secs:02d}"


def km(meters: float) -> str:
    return fr(round(meters / 1000, 1))


def whole_seconds(value: float) -> str:
    return str(round(value))


def day_label(day: date) -> str:
    return f"{day.day} {MONTHS[day.month - 1]}"
