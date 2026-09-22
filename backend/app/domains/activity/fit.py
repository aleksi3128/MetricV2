"""Lecture d'un fichier `.fit` de sortie course (`docs/import-fit.md`).

Ce module **ne connaît pas le dépôt**. Il reçoit des octets, il rend une structure. C'est
la même coupe que la moitié `analyze` de l'import Apple, et elle sert ici la même chose :
tout ce qui suit est testable sur un fichier posé à côté, sans Nextcloud et sans réseau.

## Trois pièges, tous mesurés sur un vrai fichier

**Strava écrit deux flux de `record` entrelacés.** Sous deux définitions différentes, aux
mêmes horodatages : l'un porte `distance`, l'autre porte `position_lat`, `position_long`,
`enhanced_altitude` et `speed`. Trois mille cinq cent quatre-vingt-deux messages pour mille
sept cent soixante-dix-huit instants. Un lecteur qui garde le premier venu obtient une
distance sans tracé, ou un tracé sans distance — et **rien ne le signale**, les deux
lectures rendent un objet plausible. D'où la fusion par horodatage, et non l'itération
naïve.

**Les laps ne veulent pas toujours dire quelque chose.** Le fichier de référence déclare
`num_laps: 1` et contient deux `lap`, chacun annonçant la course entière. Les recopier
donnerait deux paliers de cinq kilomètres pour une course de cinq. `_laps_hold` est la
garde ; ce qu'elle rejette repart au découpage kilométrique, qui ne ment jamais.

**Le dénivelé brut est du bruit.** Sommer les montées entre points consécutifs donne
+89,6 m là où la session en déclare 6 : l'altitude GPS oscille d'un mètre par seconde sur
du plat, et mille sept cents oscillations font une montagne. Le D+ vient donc de la
session, jamais du tracé — et un palier découpé au kilomètre n'a **pas de dénivelé du
tout** plutôt qu'un chiffre inventé.

## Un quatrième, trouvé plus tard : l'horodatage n'est pas le chrono

Le 13 septembre 2026, une sortie arrête son chronomètre 81 secondes à 4,9 km. Les paliers
se découpaient sur l'horodatage brut, et le dernier affichait **7'31"/km** pour un
kilomètre couru vers 6'10". Tout ce qui mesure une durée passe donc par `FitSample.timer_s`
— l'horodatage moins les pauses que les `event timer` déclarent (`docs/analyse-course.md`).
"""

from __future__ import annotations

import io
import re
import secrets
import zipfile
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from itertools import pairwise
from statistics import median

import fitdecode

from app.core.exceptions import ValidationFailedError
from app.domains.activity import garmin
from app.storage.errors import StorageNotFoundError
from app.storage.paths import RUN_FITS

#: 8 Mo. Une sortie de trois heures enregistrée à la seconde tient très largement dedans —
#: le fichier de référence fait 130 Ko pour trente minutes. Au-delà, ce n'est plus une
#: course : c'est un export d'historique entier, qu'on ne veut pas décoder en mémoire.
MAX_BYTES = 8 * 1024 * 1024

#: Sports acceptés. `/activite/courses` est la course, et `runs.csv` nourrit les bandes de
#: distance, le volume mensuel et les records des rappels : y écrire une sortie vélo
#: fausserait les trois d'un coup, sans qu'aucun écran ne le dise.
RUN_SPORTS = frozenset({"running", "trail_running"})

#: Tolérance des gardes de cohérence des laps. 2 % laisse passer l'arrondi d'une montre qui
#: relève au décimètre, et rejette une somme qui vaut le double de la course.
LAP_TOLERANCE = 0.02

#: Un demi-cercle FIT vaut `180 / 2³¹` degrés — l'unité dans laquelle le format stocke
#: latitudes et longitudes.
SEMICIRCLE_DEG = 180.0 / 2**31

#: Ce qui fait d'un écart entre deux points un trou d'enregistrement : dix fois le pas
#: habituel **et** plus de cent mètres. Les deux conditions ensemble — la première seule
#: se déclencherait sur une montre qui espace ses points en ligne droite, la seconde seule
#: sur un relevé volontairement peu dense.
GAP_STEPS = 10
GAP_MIN_M = 100.0

#: Les `event_type` d'un `event timer` qui arrêtent le chronomètre. Le profil FIT en a
#: quatre ; Strava n'écrit que `stop`, une montre Garmin écrit `stop_all`.
TIMER_STOPS = frozenset({"stop", "stop_all", "stop_disable", "stop_disable_all"})

#: Ce qui déclenche un tour **automatique** (`lap_trigger`). Un tour automatique au mile
#: découpait la sortie du 19/09 en quatre paliers de 1,61 km : cohérents, donc gardés par
#: `_laps_hold`, et moins lisibles que le kilomètre. Seul un tour automatique **au
#: kilomètre** est gardé — c'est le kilomètre, avec le dénivelé que la montre a lissé.
AUTO_LAP_TRIGGERS = frozenset(
    {"distance", "time", "position_start", "position_lap", "position_waypoint", "position_marked"}
)
KILOMETRE_M = 1000.0

#: Signature d'une archive `.zip` — l'« Exporter l'original » de Garmin Connect en rend une,
#: qui contient le `.fit`.
ZIP_MAGIC = b"PK\x03\x04"

#: Fenêtre du lissage de la FC max relevée, en points. Une ceinture cardio produit des
#: pics d'un battement — un contact perdu, une décharge statique — et le maximum brut en
#: ferait la référence de toutes les zones.
HR_PEAK_POINTS = 5

#: Forme exacte d'un chemin de `.fit`, telle que nous la produisons. Même stratégie que les
#: photos de repas : on ne nettoie pas ce qu'on reçoit, on refuse tout ce qui n'a pas
#: exactement cette forme.
FIT_PATH = re.compile(
    r"^(?P<y>\d{4})/(?P<m>\d{2})/(?P<d>\d{2})/(?P<n>\d{8}-\d{6}-[0-9a-f]{8})\.fit$"
)


class FitError(ValidationFailedError):
    """Fichier refusé.

    Descend du catalogue d'erreurs : un `.fit` illisible est une saisie invalide, pas une
    panne. Le client reçoit `validation_error` et un message affichable tel quel.
    """


# ── Ce qu'un fichier rend ─────────────────────────────


@dataclass(frozen=True)
class FitSplit:
    """Un palier mesuré. Sans `partial` ni `distance_km` : le service les repose depuis
    `splits.mark_partials` et `splits.measure_distances`, qui sont les mêmes pour un import
    de captures. Deux façons de décider d'un reliquat en donneraient deux réponses."""

    index: int
    duration_s: float
    pace_min_km: float | None = None
    avg_hr: int | None = None
    cadence_spm: int | None = None
    elevation_m: int | None = None


@dataclass(frozen=True, slots=True)
class FitSample:
    """Un instant du fichier, **en temps de chrono**.

    `timer_s` compte les secondes de chronomètre depuis le départ, pauses retirées. C'est
    la seule horloge de ce qui suit : une durée lue sur l'horodatage brut compterait la
    pause de 81 s du 13/09 comme du temps couru.

    Les degrés restent ici, et **ne sortent pas du serveur** : `analysis.py` les projette
    et les normalise avant qu'ils ne deviennent un tracé.
    """

    timer_s: float
    distance_m: float | None = None
    lat: float | None = None
    lon: float | None = None
    altitude_m: float | None = None
    heart_rate: int | None = None
    #: En **pas** par minute, déjà doublée — `record.cadence` compte des cycles de deux pas.
    cadence_spm: int | None = None
    power_w: int | None = None
    #: La foulée, telle qu'une montre l'estime — au poignet sans capteur de poitrine.
    stance_ms: float | None = None
    vertical_oscillation_cm: float | None = None
    step_length_m: float | None = None
    #: Champs **non documentés** (`garmin.py`) : lus par numéro, gardés par des bornes.
    performance_condition: int | None = None
    stamina_pct: int | None = None


@dataclass(frozen=True, slots=True)
class FitPause:
    """Un arrêt **du chronomètre** : à quel temps de chrono, et pour combien de temps."""

    timer_s: float
    duration_s: float


@dataclass(frozen=True)
class FitMetrics:
    """Ce que la montre a mesuré ou calculé **sur la séance**, au-delà de `runs.csv`.

    Tout est facultatif : un export Strava de téléphone n'en porte rien, une montre en
    porte presque tout. Ce qui vient de `garmin.py` n'est pas documenté par le fabricant,
    et l'écran le signe « selon Garmin » (`docs/coach-course.md`, **C5**).
    """

    avg_power_w: int | None = None
    normalized_power_w: int | None = None
    max_power_w: int | None = None
    avg_stance_ms: float | None = None
    avg_vertical_oscillation_cm: float | None = None
    avg_vertical_ratio_pct: float | None = None
    avg_step_length_m: float | None = None
    training_effect_aerobic: float | None = None
    training_effect_anaerobic: float | None = None
    training_load: int | None = None
    #: La FC max **réglée dans la montre** — 220 moins l'âge tant que personne ne l'a changée.
    #: Une référence de repli pour les zones, jamais une mesure (**C4**).
    watch_max_hr: int | None = None
    vo2max: float | None = None
    recovery_h: float | None = None
    performance_condition_start: int | None = None
    performance_condition_end: int | None = None
    stamina_start_pct: int | None = None
    stamina_end_pct: int | None = None
    #: Vrai quand un capteur **externe** est déclaré — ceinture, capteur de foulée. Sans
    #: lui, la foulée est estimée au poignet, et l'écran le dit.
    external_sensor: bool = False
    device: str | None = None


@dataclass(frozen=True)
class FitRun:
    """Une sortie telle que le fichier la décrit, avant toute écriture."""

    day: date
    duration_min: float
    distance_km: float
    start: time | None = None
    end: time | None = None
    elevation_m: int | None = None
    cadence_spm: int | None = None
    avg_hr: int | None = None
    #: La plus haute fréquence cardiaque relevée, lissée sur `HR_PEAK_POINTS`. Elle nourrit
    #: la FC max **déduite** quand aucune n'est saisie (`docs/analyse-course.md`, **A9**).
    max_hr: int | None = None
    active_calories: int | None = None
    split_length_km: float | None = None
    splits: list[FitSplit] = field(default_factory=list)
    #: Vrai quand les paliers viennent des laps du fichier, faux quand ils ont été
    #: découpés au kilomètre. Sert au message rendu à l'écran et aux tests — pas au calcul.
    splits_from_laps: bool = False
    #: Les relevés fusionnés, en temps de chrono et dans l'ordre. `analysis.py` en tire la
    #: courbe, le tracé, les arrêts et les meilleurs efforts.
    samples: list[FitSample] = field(default_factory=list)
    pauses: list[FitPause] = field(default_factory=list)
    #: Vrai quand l'enregistrement s'est interrompu — ni paliers ni efforts, pour la même
    #: raison : on ne sait pas comment répartir les mètres manquants.
    has_gap: bool = False
    metrics: FitMetrics = field(default_factory=FitMetrics)


# ── Décodage ──────────────────────────────────────────


def read(data: bytes) -> FitRun:
    """Décode un `.fit` de course. Lève `FitError` sur tout ce qui n'en est pas un."""
    _check(data)

    session: dict[str, object] = {}
    activity: dict[str, object] = {}
    laps: list[dict[str, object]] = []
    events: list[dict[str, object]] = []
    points: dict[datetime, dict[str, object]] = {}
    extras: dict[datetime, dict[int, object]] = {}
    session_zones: dict[str, object] = {}
    devices: list[dict[str, object]] = []
    creator: dict[str, object] = {}
    summary = garmin.Summary()

    try:
        with fitdecode.FitReader(io.BytesIO(data)) as reader:
            for frame in reader:
                if not isinstance(frame, fitdecode.FitDataMessage):
                    continue
                if frame.name == "session":
                    session = _values(frame)
                elif frame.name == "activity":
                    activity = _values(frame)
                elif frame.name == "lap":
                    laps.append(_values(frame))
                elif frame.name == "event":
                    events.append(_values(frame))
                elif frame.name == "record":
                    values = _values(frame)
                    moment = values.get("timestamp")
                    if isinstance(moment, datetime):
                        # La fusion, et non `points[moment] = values` : c'est ici que se
                        # recolle ce que Strava a séparé en deux flux.
                        points.setdefault(moment, {}).update(values)
                        extras.setdefault(moment, {}).update(garmin.numbered(frame))
                elif frame.name == "time_in_zone":
                    values = _values(frame)
                    if values.get("reference_mesg") == "session":
                        session_zones = values
                elif frame.name == "device_info":
                    devices.append(_values(frame))
                elif frame.name == "file_id":
                    creator = _values(frame)
                elif frame.global_mesg_num == garmin.METRICS_MESSAGE:
                    summary = garmin.summary(garmin.numbered(frame))
    except FitError:
        raise
    # `fitdecode` lève large sur un fichier tronqué : une erreur de structure, une fin
    # de flux inattendue, un type de base inconnu. Toutes disent la même chose à
    # l'utilisateur, et aucune n'est une panne du serveur.
    except Exception as error:
        raise FitError("Ce fichier .fit n'a pas pu être lu jusqu'au bout.") from error

    _check_sport(session)

    moments = sorted(points)
    ordered = [points[key] for key in moments]
    samples, pauses = _samples(ordered, events, [extras.get(key, {}) for key in moments])
    duration_s = _duration_s(session, samples)
    distance_m = _distance_m(session, ordered)
    if duration_s is None or distance_m is None:
        raise FitError("Ce fichier ne porte ni durée ni distance exploitables.")

    start = _start(session, activity, ordered)
    if start is None:
        raise FitError("Ce fichier ne porte pas d'heure de départ.")

    duration_min = round(duration_s / 60, 3)
    distance_km = round(distance_m / 1000, 3)
    has_gap = _has_gap([item.distance_m for item in samples if item.distance_m is not None])
    split_length_km, splits, from_laps = _splits(laps, samples, distance_km, has_gap)

    return FitRun(
        day=start.date(),
        duration_min=duration_min,
        distance_km=distance_km,
        start=start.time().replace(microsecond=0),
        end=(start + timedelta(seconds=duration_s)).time().replace(microsecond=0),
        elevation_m=_int(session.get("total_ascent")),
        cadence_spm=_cadence(session, ordered, duration_min),
        avg_hr=_avg_hr(session, ordered),
        max_hr=_max_hr(session, samples),
        active_calories=_int(session.get("total_calories")),
        split_length_km=split_length_km,
        splits=splits,
        splits_from_laps=from_laps,
        samples=samples,
        pauses=pauses,
        has_gap=has_gap,
        metrics=_metrics(session, session_zones, devices, creator, summary, samples),
    )


def _check(data: bytes) -> None:
    """Refuse avant de décoder. Un fichier vide, trop lourd, ou qui ne porte pas la marque
    `.FIT` à l'octet 8 n'a pas besoin d'être ouvert pour être écarté."""
    if not data:
        raise FitError("Le fichier est vide.")
    if len(data) > MAX_BYTES:
        raise FitError(f"Fichier trop lourd : {MAX_BYTES // (1024 * 1024)} Mo au maximum.")
    if len(data) < 14 or data[8:12] != b".FIT":
        raise FitError("Ce fichier n'est pas un .fit (aucune signature FIT lisible).")


def _check_sport(session: dict[str, object]) -> None:
    """Un `.fit` de vélo ou de natation est refusé **en toutes lettres**.

    Un sport absent passe : certains exports n'écrivent pas le champ, et refuser sur une
    absence perdrait des fichiers valides. Un sport **présent et autre** est un refus — il
    ne s'agit pas d'un doute mais d'une sortie qui n'a rien à faire dans `runs.csv`.
    """
    sport = session.get("sport")
    if isinstance(sport, str) and sport not in RUN_SPORTS:
        label = sport.replace("_", " ")
        raise FitError(f"Ce fichier décrit une sortie « {label} », pas une course à pied.")


def _values(frame: fitdecode.FitDataMessage) -> dict[str, object]:
    """Les champs renseignés d'un message, par nom. Les absents sont écartés ici plutôt
    que testés partout en aval."""
    return {item.name: item.value for item in frame.fields if item.value is not None}


# ── Relevés, en temps de chrono ───────────────────────


def _samples(
    points: Sequence[dict[str, object]],
    events: Sequence[dict[str, object]],
    extras: Sequence[dict[int, object]] | None = None,
) -> tuple[list[FitSample], list[FitPause]]:
    """Les relevés fusionnés, **horodatage moins pauses**, et les pauses elles-mêmes.

    Les pauses viennent des `event timer` : un `stop`, puis un `start`. Un relevé écrit
    pendant qu'un chronomètre est arrêté est écarté — il ne mesure pas de la course, et le
    garder donnerait deux points au même temps de chrono. Strava n'en écrit aucun ; une
    montre en pause automatique non plus, mais rien ne le garantit.

    Un `stop` sans `start` derrière est la fin de la sortie, pas une pause.
    """
    numbered = list(extras) if extras is not None else [{} for _ in points]
    paired = [
        (item, numbered[index])
        for index, item in enumerate(points)
        if isinstance(item.get("timestamp"), datetime)
    ]
    timed = [item for item, _ in paired]
    if not timed:
        return [], []
    origin = _naive(timed[0]["timestamp"])

    switches: list[tuple[datetime, bool]] = []
    for event in events:
        moment = event.get("timestamp")
        if event.get("event") != "timer" or not isinstance(moment, datetime):
            continue
        kind = event.get("event_type")
        if kind == "start":
            switches.append((_naive(moment), True))
        elif kind in TIMER_STOPS:
            switches.append((_naive(moment), False))
    switches.sort(key=lambda item: item[0])

    pauses: list[FitPause] = []
    paused_total = 0.0
    stopped_at: datetime | None = None
    cursor = 0
    samples: list[FitSample] = []

    for item, extra in paired:
        moment = _naive(item["timestamp"])
        while cursor < len(switches) and switches[cursor][0] <= moment:
            at, running = switches[cursor]
            cursor += 1
            if not running and stopped_at is None:
                stopped_at = at
            elif running and stopped_at is not None:
                duration = (at - stopped_at).total_seconds()
                if duration > 0:
                    pauses.append(
                        FitPause(
                            timer_s=round((stopped_at - origin).total_seconds() - paused_total, 1),
                            duration_s=round(duration, 1),
                        )
                    )
                    paused_total += duration
                stopped_at = None
        if stopped_at is not None and moment > stopped_at:
            continue

        lat, lon = _float(item.get("position_lat")), _float(item.get("position_long"))
        altitude = _float(item.get("enhanced_altitude"))
        if altitude is None:
            altitude = _float(item.get("altitude"))
        cadence = _float(item.get("cadence"))
        if cadence is not None:
            cadence += _float(item.get("fractional_cadence")) or 0.0
        samples.append(
            FitSample(
                timer_s=round((moment - origin).total_seconds() - paused_total, 1),
                distance_m=_float(item.get("distance")),
                lat=lat * SEMICIRCLE_DEG if lat is not None and lon is not None else None,
                lon=lon * SEMICIRCLE_DEG if lat is not None and lon is not None else None,
                altitude_m=altitude,
                heart_rate=_bounded(_int(item.get("heart_rate")) or 0, 30, 250),
                cadence_spm=_bounded(round(cadence * 2), 30, 300) if cadence else None,
                power_w=_bounded(_int(item.get("power")) or 0, 1, 2500),
                stance_ms=_within(_float(item.get("stance_time")), 100, 600),
                # Le profil FIT les donne en millimètres ; l'écran lit des cm et des m.
                vertical_oscillation_cm=_scaled(item.get("vertical_oscillation"), 0.1, 2, 25),
                step_length_m=_scaled(item.get("step_length"), 0.001, 0.2, 3),
                performance_condition=garmin.performance_condition(extra),
                stamina_pct=garmin.stamina(extra),
            )
        )
    return samples, pauses


def _naive(moment: object) -> datetime:
    assert isinstance(moment, datetime)
    return moment.replace(tzinfo=None)


# ── Résumé ────────────────────────────────────────────


def _duration_s(session: dict[str, object], samples: Sequence[FitSample]) -> float | None:
    """`total_timer_time` d'abord : c'est le temps **en mouvement**, celui dont l'allure
    affichée par la montre découle. L'elapsed compte les pauses, et une course arrêtée cinq
    minutes à un feu rendrait une allure que rien n'a couru."""
    for key in ("total_timer_time", "total_elapsed_time"):
        value = _float(session.get(key))
        if value and value > 0:
            return value
    if len(samples) >= 2:
        span = samples[-1].timer_s - samples[0].timer_s
        return span if span > 0 else None
    return None


def _distance_m(session: dict[str, object], points: Sequence[dict[str, object]]) -> float | None:
    value = _float(session.get("total_distance"))
    if value and value > 0:
        return value
    for item in reversed(points):
        last = _float(item.get("distance"))
        if last and last > 0:
            return last
    return None


def _start(
    session: dict[str, object],
    activity: dict[str, object],
    points: Sequence[dict[str, object]],
) -> datetime | None:
    """L'instant du départ, **ramené à l'heure qu'il était sur place**.

    Le fichier porte son propre décalage : `activity.local_timestamp` et
    `activity.timestamp` désignent le même instant, l'un en heure locale, l'autre en UTC.
    Leur écart est le fuseau où la course a eu lieu — +2 h sur le fichier de référence.

    C'est lui qu'on suit, et non le fuseau du serveur : une sortie courue en voyage porte
    la date du pays où elle a été courue, qui est celle sous laquelle on la cherchera. Le
    §2 de `CLAUDE.md` interdit au **client** de dater une donnée ; la date reste ici
    décidée côté serveur, à partir de ce que le fichier déclare plutôt que d'une horloge.
    """
    moment = session.get("start_time") or activity.get("timestamp")
    if not isinstance(moment, datetime):
        for item in points:
            if isinstance(item.get("timestamp"), datetime):
                moment = item["timestamp"]
                break
    if not isinstance(moment, datetime):
        return None

    local, utc = activity.get("local_timestamp"), activity.get("timestamp")
    if isinstance(local, datetime) and isinstance(utc, datetime):
        offset = local.replace(tzinfo=None) - utc.replace(tzinfo=None)
        return moment.replace(tzinfo=None) + offset
    return moment.replace(tzinfo=None)


def _cadence(
    session: dict[str, object], points: Sequence[dict[str, object]], duration_min: float
) -> int | None:
    """La cadence en **pas** par minute.

    `total_strides` compte des cycles de deux pas : 2 447 foulées en 29,8 minutes font 164
    pas par minute, ce qui est une cadence de course crédible. C'est une multiplication sur
    une mesure du téléphone, pas une déduction depuis l'allure — laquelle reste interdite
    (`models.py`, `RunRow.cadence_spm`) parce qu'une cadence ne se lit pas dans une vitesse.
    """
    strides = _float(session.get("total_strides") or session.get("total_cycles"))
    if strides and duration_min > 0:
        return _bounded(round(strides * 2 / duration_min), 30, 300)

    declared = _float(session.get("avg_cadence"))
    if declared:
        return _bounded(round(declared * 2), 30, 300)

    sampled = [_float(item.get("cadence")) for item in points]
    live = [value for value in sampled if value]
    if live:
        return _bounded(round(sum(live) / len(live) * 2), 30, 300)
    return None


def _avg_hr(session: dict[str, object], points: Sequence[dict[str, object]]) -> int | None:
    declared = _int(session.get("avg_heart_rate"))
    if declared:
        return _bounded(declared, 1, 260)
    beats = [_float(item.get("heart_rate")) for item in points]
    live = [value for value in beats if value]
    if live:
        return _bounded(round(sum(live) / len(live)), 1, 260)
    return None


def _max_hr(session: dict[str, object], samples: Sequence[FitSample]) -> int | None:
    """La plus haute fréquence **tenue** : moyenne glissante sur `HR_PEAK_POINTS` relevés.

    Pas `session.max_heart_rate` : c'est le maximum brut de la montre, pic d'un battement
    compris, et il deviendrait la référence de toutes les zones. Il ne sert que quand le
    fichier n'a aucun relevé à lisser.
    """
    beats = [item.heart_rate for item in samples if item.heart_rate is not None]
    if len(beats) >= HR_PEAK_POINTS:
        best = max(
            sum(beats[index : index + HR_PEAK_POINTS]) / HR_PEAK_POINTS
            for index in range(len(beats) - HR_PEAK_POINTS + 1)
        )
        return _bounded(round(best), 30, 250)
    declared = _int(session.get("max_heart_rate"))
    return _bounded(declared, 30, 250) if declared else None


# ── Paliers ───────────────────────────────────────────


def _splits(
    laps: list[dict[str, object]],
    samples: Sequence[FitSample],
    distance_km: float,
    has_gap: bool,
) -> tuple[float | None, list[FitSplit], bool]:
    """Les laps du fichier s'ils tiennent debout, le découpage kilométrique sinon (**F2**).

    Un tour **automatique** ne tient debout qu'au kilomètre : au mile, au demi-kilomètre
    ou toutes les cinq minutes, il découpe la sortie en unités que l'écran ne parle pas,
    et le kilomètre dit la même chose plus lisiblement.
    """
    if _laps_hold(laps, distance_km) and not _automatic_off_kilometre(laps):
        return _from_laps(laps)
    if has_gap:
        return None, [], False
    return _from_points(samples)


def _laps_hold(laps: list[dict[str, object]], distance_km: float) -> bool:
    """Trois conditions, et chacune écarte un cas rencontré.

    1. **Au moins deux laps.** Un lap unique est la course entière : le recopier donnerait
       un palier qui ne dit rien de plus que le résumé.
    2. **Leur somme retombe sur la distance de la course.** Le fichier de référence annonce
       deux laps de 5 075 m pour une course de 5 075 m ; leur somme vaut le double, et
       c'est ce qui les démasque.
    3. **Les laps pleins font la même longueur.** Un tour automatique au kilomètre ou au
       mile produit des paliers réguliers, et c'est la seule forme que `run_splits.csv` sait
       relire — sa longueur de palier est une colonne de la course, pas de la ligne. Des
       tours manuels irréguliers repartent donc au kilomètre, ce qui ne perd rien : un
       découpage régulier du même trajet est strictement plus lisible.
    """
    if len(laps) < 2:
        return False

    lengths = [_float(lap.get("total_distance")) or 0.0 for lap in laps]
    if any(length <= 0 for length in lengths):
        return False

    total_m = distance_km * 1000
    if abs(sum(lengths) - total_m) > total_m * LAP_TOLERANCE:
        return False

    full = lengths[:-1]
    reference = median(full)
    if reference <= 0:
        return False
    if any(abs(length - reference) > reference * LAP_TOLERANCE for length in full):
        return False
    # Le dernier tour est un reliquat : plus court, jamais plus long.
    return lengths[-1] <= reference * (1 + LAP_TOLERANCE)


def _automatic_off_kilometre(laps: list[dict[str, object]]) -> bool:
    """Vrai quand les tours pleins sont déclenchés par la montre, à une autre longueur que
    le kilomètre. Un tour d'entraînement structuré (`wkt_step_index`) n'est pas
    automatique : c'est une étape, et elle dit quelque chose."""
    full = laps[:-1]
    automatic = all(
        lap.get("lap_trigger") in AUTO_LAP_TRIGGERS and lap.get("wkt_step_index") is None
        for lap in full
    )
    if not full or not automatic:
        return False
    reference = median(_float(lap.get("total_distance")) or 0.0 for lap in full)
    return abs(reference - KILOMETRE_M) > KILOMETRE_M * LAP_TOLERANCE


def _from_laps(laps: list[dict[str, object]]) -> tuple[float | None, list[FitSplit], bool]:
    """Les tours tels que la montre les a relevés, dénivelé compris.

    C'est le seul chemin où un palier porte un dénivelé : celui d'un lap a été lissé par la
    montre, contrairement à la somme des oscillations d'altitude entre deux points.
    """
    lengths = [_float(lap.get("total_distance")) or 0.0 for lap in laps]
    reference = median(lengths[:-1])

    splits: list[FitSplit] = []
    for index, lap in enumerate(laps, start=1):
        duration = _float(lap.get("total_timer_time")) or _float(lap.get("total_elapsed_time"))
        if not duration or duration <= 0:
            continue
        distance = lengths[index - 1]
        # `avg_running_cadence` en course — c'est le nom que le profil donne au même champ
        # quand le sport est la course, et celui que `fitdecode` rend pour une Garmin. Lire
        # `avg_cadence` seul laissait vides les paliers de toute montre.
        cadence = _float(lap.get("avg_running_cadence") or lap.get("avg_cadence"))
        if cadence is not None:
            cadence += _float(lap.get("avg_fractional_cadence")) or 0.0
        splits.append(
            FitSplit(
                index=index,
                duration_s=round(duration, 1),
                pace_min_km=round(duration / 60 / (distance / 1000), 3) if distance else None,
                avg_hr=_bounded(_int(lap.get("avg_heart_rate")) or 0, 1, 260) or None,
                cadence_spm=_bounded(round(cadence * 2), 30, 300) if cadence else None,
                elevation_m=_int(lap.get("total_ascent")),
            )
        )
    return round(reference / 1000, 3), splits, True


def _from_points(samples: Sequence[FitSample]) -> tuple[float | None, list[FitSplit], bool]:
    """Découpe le trajet au kilomètre, à partir des distances cumulées **en temps de chrono**.

    Le palier se ferme sur le **premier point qui franchit la borne**, pas sur une
    interpolation : à un point par seconde et six minutes au kilomètre, l'écart tient dans
    trois mètres, et interpoler donnerait une précision que la mesure n'a pas.

    Aucun dénivelé n'est posé ici — voir l'en-tête du module.

    **Un trou d'enregistrement rend zéro palier, pas des paliers approchés** — `_splits` ne
    nous appelle pas quand `_has_gap` a parlé. Un tunnel, une montre qui reprend : la course
    a avancé de plusieurs centaines de mètres sans qu'on sache comment les répartir, et le
    palier qui les absorbe se donne pour un kilomètre. `run_splits.csv` ne sait porter que
    des paliers de longueur égale, alors les inventer ferait mentir l'écart-type, la dérive
    et la régularité que la page Course affiche comme des mesures.
    """
    measured = [item for item in samples if item.distance_m is not None]
    if len(measured) < 2:
        return None, [], False

    splits: list[FitSplit] = []
    boundary = 1
    opened = measured[0].timer_s
    covered = 0.0
    bucket: list[FitSample] = []

    for item in measured:
        bucket.append(item)
        if (item.distance_m or 0.0) < boundary * 1000:
            continue
        duration = item.timer_s - opened
        if duration <= 0:
            return None, [], False
        splits.append(_bucket_split(len(splits) + 1, duration, 1.0, bucket))
        opened, covered = item.timer_s, float(boundary * 1000)
        bucket = []
        boundary += 1

    remainder_m = (measured[-1].distance_m or 0.0) - covered
    trailing = measured[-1].timer_s - opened
    # Sous dix mètres, le reliquat est l'arrêt de la montre et non un morceau de course :
    # l'écrire donnerait un palier d'une seconde qui fausserait la médiane des durées dont
    # `mark_partials` se sert pour reconnaître les reliquats.
    if remainder_m > 10 and trailing > 0:
        splits.append(_bucket_split(len(splits) + 1, trailing, remainder_m / 1000, bucket))

    return (1.0 if splits else None), splits, False


def _has_gap(distances: Sequence[float]) -> bool:
    """Vrai quand un saut de distance trahit un enregistrement interrompu.

    Le trou se reconnaît sur le **pas médian**, et non sur un seuil en mètres. Une montre
    relève à la seconde, une autre tous les dix mètres, une troisième espace ses points en
    ligne droite : un seuil fixe déclarerait la troisième cassée. Dix fois le pas habituel
    **et** plus de cent mètres, c'est un trou dans toutes les cadences d'échantillonnage.
    """
    steps = [after - before for before, after in pairwise(distances) if after > before]
    if len(steps) < 2:
        return True
    usual = median(steps)
    return any(step > GAP_STEPS * usual and step > GAP_MIN_M for step in steps)


def _bucket_split(
    index: int, duration_s: float, distance_km: float, bucket: Iterable[FitSample]
) -> FitSplit:
    sampled = list(bucket)
    beats = [item.heart_rate for item in sampled if item.heart_rate is not None]
    steps = [item.cadence_spm for item in sampled if item.cadence_spm is not None]
    return FitSplit(
        index=index,
        duration_s=round(duration_s, 1),
        pace_min_km=round(duration_s / 60 / distance_km, 3) if distance_km > 0 else None,
        avg_hr=_bounded(round(sum(beats) / len(beats)), 1, 260) if beats else None,
        # Déjà en pas par minute : `_samples` a doublé chaque relevé.
        cadence_spm=_bounded(round(sum(steps) / len(steps)), 30, 300) if steps else None,
    )


# ── Ce que la montre ajoute ───────────────────────────


def _metrics(
    session: dict[str, object],
    zones: dict[str, object],
    devices: Sequence[dict[str, object]],
    creator: dict[str, object],
    summary: garmin.Summary,
    samples: Sequence[FitSample],
) -> FitMetrics:
    conditions = [
        item.performance_condition for item in samples if item.performance_condition is not None
    ]
    staminas = [item.stamina_pct for item in samples if item.stamina_pct is not None]
    oscillation = _float(session.get("avg_vertical_oscillation"))
    step = _float(session.get("avg_step_length"))
    load = _float(session.get("training_load_peak"))
    return FitMetrics(
        avg_power_w=_bounded(_int(session.get("avg_power")) or 0, 1, 2500),
        normalized_power_w=_bounded(_int(session.get("normalized_power")) or 0, 1, 2500),
        max_power_w=_bounded(_int(session.get("max_power")) or 0, 1, 2500),
        avg_stance_ms=_within(_float(session.get("avg_stance_time")), 100, 600),
        avg_vertical_oscillation_cm=_scaled(oscillation, 0.1, 2, 25),
        avg_vertical_ratio_pct=_within(_float(session.get("avg_vertical_ratio")), 1, 30),
        avg_step_length_m=_scaled(step, 0.001, 0.2, 3),
        training_effect_aerobic=_within(_float(session.get("total_training_effect")), 0, 5),
        training_effect_anaerobic=_within(
            _float(session.get("total_anaerobic_training_effect")), 0, 5
        ),
        training_load=_bounded(round(load), 0, 2000) if load is not None else None,
        watch_max_hr=_bounded(_int(zones.get("max_heart_rate")) or 0, 100, 250),
        vo2max=summary.vo2max,
        recovery_h=summary.recovery_h,
        performance_condition_start=conditions[0] if conditions else None,
        performance_condition_end=conditions[-1] if conditions else None,
        stamina_start_pct=staminas[0] if staminas else None,
        stamina_end_pct=staminas[-1] if staminas else None,
        external_sensor=any(
            device.get("source_type") in {"antplus", "bluetooth", "bluetooth_low_energy"}
            for device in devices
        ),
        device=_device(creator),
    )


def _device(creator: dict[str, object]) -> str | None:
    """`epix_gen2_pro_47` → `Epix Gen2 Pro 47`. Le nom que le profil donne au produit, et
    rien d'inventé : un produit que le profil ne connaît pas n'a que son fabricant."""
    product = creator.get("garmin_product") or creator.get("product_name")
    if isinstance(product, str) and product:
        return " ".join(part.capitalize() for part in product.split("_"))
    maker = creator.get("manufacturer")
    return maker.capitalize() if isinstance(maker, str) and maker else None


# ── L'archive d'export ────────────────────────────────


def unpack(data: bytes) -> bytes:
    """Le `.fit` d'une archive `.zip` d'export, ou les octets tels quels.

    Garmin Connect exporte l'original dans un `.zip` qui ne contient que lui. On l'accepte
    **s'il n'y a qu'un `.fit`** — deux feraient deux sorties sous un seul import — et dans
    la limite de `MAX_BYTES` **décompressé**, lue sans jamais décompresser au-delà : une
    archive de quelques kilo-octets peut en contenir des gigas.
    """
    if not data.startswith(ZIP_MAGIC):
        return data
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        members = [
            item
            for item in archive.infolist()
            if not item.is_dir() and item.filename.lower().endswith(".fit")
        ]
        if len(members) != 1:
            raise FitError(
                "Cette archive doit contenir un seul fichier .fit"
                + (
                    " — elle n'en contient aucun."
                    if not members
                    else f" — elle en contient {len(members)}."
                )
            )
        with archive.open(members[0]) as handle:
            content = handle.read(MAX_BYTES + 1)
    except FitError:
        raise
    except (zipfile.BadZipFile, zipfile.LargeZipFile, OSError, EOFError) as error:
        raise FitError("Cette archive .zip n'a pas pu être ouverte.") from error
    if len(content) > MAX_BYTES:
        raise FitError(f"Fichier trop lourd : {MAX_BYTES // (1024 * 1024)} Mo au maximum.")
    return content


# ── Rangement (`STO-07`) ──────────────────────────────


def build_path(when: datetime) -> str:
    """Chemin de rangement d'un nouveau fichier, relatif à `RUN_FITS`.

    `AAAA/MM/JJ/AAAAMMJJ-HHMMSS-aléa.fit`, comme une photo de repas. L'aléa évite qu'une
    seconde partagée écrase le fichier précédent — deux sorties du même jour ne sont pas
    une hypothèse d'école pour qui court matin et soir.
    """
    return f"{when:%Y/%m/%d}/{when:%Y%m%d-%H%M%S}-{secrets.token_hex(4)}.fit"


def storage_path(relative: str) -> str:
    """Chemin de stockage complet, après validation stricte.

    Lève `StorageNotFoundError` — et non une erreur de validation — sur une forme
    inattendue : du point de vue de l'appelant, une adresse qui ne désigne pas un de nos
    fichiers n'existe pas. Distinguer « mal formé » de « absent » renseignerait sur
    l'arborescence.

    La valeur vient pourtant de notre propre CSV, pas d'une requête. Elle est vérifiée
    quand même : un fichier qu'on rouvre dans un tableur est un fichier qu'on peut retaper,
    et `STO-02` promet qu'on le peut.
    """
    if not FIT_PATH.match(relative):
        raise StorageNotFoundError("Ce fichier n'existe pas.")

    full = f"{RUN_FITS}/{relative}"
    if ".." in full.split("/") or not full.startswith(f"{RUN_FITS}/"):
        raise StorageNotFoundError("Ce fichier n'existe pas.")
    return full


# ── Lectures défensives ───────────────────────────────


def _float(value: object) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _int(value: object) -> int | None:
    number = _float(value)
    return round(number) if number is not None else None


def _within(value: float | None, low: float, high: float) -> float | None:
    """`_bounded` pour une mesure décimale : hors bornes, **absente**."""
    if value is None or not low <= value <= high:
        return None
    return round(value, 2)


def _scaled(value: object, factor: float, low: float, high: float) -> float | None:
    number = _float(value)
    return _within(number * factor, low, high) if number is not None else None


def _bounded(value: int, low: int, high: int) -> int | None:
    """Hors bornes, la valeur est **écartée** plutôt que rabotée.

    Les bornes sont celles de `core/validation.py`, et les dépasser veut dire qu'on a mal
    lu le champ — un capteur débranché rend 0, une cadence en tours par minute rend 90 là
    où on attend 180. Ramener à la borne écrirait ce chiffre faux comme s'il était mesuré.
    """
    return value if low <= value <= high else None
