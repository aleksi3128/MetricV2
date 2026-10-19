"""Lecture d'un `.fit` de natation en piscine (`docs/planning-natation.md` §6).

Le pendant de `fit.py` pour la nage, et la même coupe : ce module **décode et juge**, il
n'écrit rien. Il ne sait pas où le fichier sera rangé ni dans quel CSV ; il rend une séance
lue, tour par tour, et la réécrit dans la notation du planning.

## Ce que le fichier de référence a appris

`nat.fit`, une Epix Pro en bassin de 25 m, décodé avant d'écrire une ligne :

* **un appui sur « tour » à chaque arrêt au mur.** Chaque tour est donc soit une nage
  (distance > 0), soit un repos (distance 0, aucune longueur). Le carnet se lit tel quel,
  sans rien deviner ;
* **la montre coupe des longueurs en deux.** Trois tours de « 75 m » contenaient deux
  longueurs de 16 à 24 s à 7–9 coups, quand la médiane du crawl était de ~39 s à 13–16
  coups : une longueur comptée deux fois. D'où `suspect` — **signalé, jamais corrigé** :
  une correction automatique serait fausse le jour où l'on a vraiment nagé un 75 ;
* **la nage détectée se trompe** sur la première longueur après la coulée (« brasse puis
  crawl », toujours dans cet ordre, sur des 50 m nagés en crawl). Elle reste un indice,
  corrigeable au tour, et marquée comme telle tant qu'elle n'est pas confirmée.
"""

from __future__ import annotations

import io
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, time
from statistics import median

import fitdecode

from app.core.swim_notation import format_clock
from app.domains.activity import fit
from app.domains.activity.fit import FitError

#: Ce que `swim_stroke` vaut dans le profil FIT, rendu dans la notation du planning.
#: `drill` est un éducatif ; `mixed` n'est pas une nage, c'est l'aveu que le tour en
#: mêle plusieurs — il ne figure pas ici.
STROKES: dict[str, str] = {
    "freestyle": "CR",
    "backstroke": "DOS",
    "breaststroke": "BR",
    "butterfly": "PAP",
    "im": "4N",
    "drill": "ÉD",
}

#: La règle de soupçon (§6.2) : une longueur active plus courte que 70 % de la médiane de
#: la séance **et** nagée en moins de dix coups. Les deux ensemble — la durée seule
#: marquerait un vrai sprint, les coups seuls une coulée longue.
SUSPECT_SHARE = 0.7
SUSPECT_STROKES = 10

#: Deux tours se regroupent dans la réécriture si leurs repos sont à 15 s près : au-delà,
#: « 4×50 R~40 » cacherait qu'un des repos a duré trois minutes.
GROUP_REST_S = 15
#: Le repos d'un groupe est arrondi à 5 s : c'est ce qu'un entraîneur écrirait, et la
#: seconde près dirait une précision que personne n'a voulue.
REST_STEP_S = 5


@dataclass(frozen=True)
class FitLength:
    """Une longueur, active ou de repos."""

    active: bool
    duration_s: float
    stroke: str | None = None
    strokes: int | None = None


@dataclass
class FitSwimLap:
    """Un tour, tel que l'appui sur le bouton l'a délimité."""

    kind: str  # "swim" ou "rest"
    distance_m: float
    duration_s: float
    #: Les longueurs de repos **dans** un tour de nage : on a soufflé sans appuyer.
    idle_s: float = 0.0
    #: Les nages détectées, longueur par longueur, dans la notation : `["BR", "CR"]`.
    detected: list[str] = field(default_factory=list)
    strokes: int | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    suspect: bool = False


@dataclass
class FitSwim:
    """Une séance en piscine, lue."""

    day: date
    start: time
    pool_m: float
    distance_m: float
    #: Temps au chrono, pauses du bouton exclues — l'équivalent de `total_timer_time`.
    duration_s: float
    elapsed_s: float
    avg_hr: int | None
    max_hr: int | None
    strokes: int | None
    calories: int | None
    laps: list[FitSwimLap]


def read(data: bytes) -> FitSwim:
    """Décode un `.fit` de natation en piscine. Lève `FitError` sur tout le reste."""
    fit.check(data)

    session: dict[str, object] = {}
    activity: dict[str, object] = {}
    laps: list[dict[str, object]] = []
    lengths: list[dict[str, object]] = []
    records: list[dict[str, object]] = []

    try:
        with fitdecode.FitReader(io.BytesIO(data)) as reader:
            for frame in reader:
                if not isinstance(frame, fitdecode.FitDataMessage):
                    continue
                values = fit.values_of(frame)
                if frame.name == "session":
                    session = values
                elif frame.name == "activity":
                    activity = values
                elif frame.name == "lap":
                    laps.append(values)
                elif frame.name == "length":
                    lengths.append(values)
                elif frame.name == "record":
                    records.append(values)
    except Exception as error:
        raise FitError("Ce fichier .fit n'a pas pu être lu jusqu'au bout.") from error

    check_sport(session)

    pool = _float(session.get("pool_length"))
    if pool is None or pool <= 0:
        raise FitError("Ce fichier ne dit pas la longueur du bassin : il n'est pas lisible.")

    start = fit.start_of(session, activity, records)
    if start is None:
        raise FitError("Ce fichier ne porte pas d'heure de départ.")

    distance = _float(session.get("total_distance"))
    timer = _float(session.get("total_timer_time"))
    if distance is None or timer is None or not laps:
        raise FitError("Ce fichier ne porte ni distance, ni durée, ni tours exploitables.")

    read_lengths = [_length(item) for item in lengths]
    read_laps = [_lap(item, read_lengths) for item in laps]
    _flag_suspects(read_laps, read_lengths, laps)

    heart = [rate for rate in (_int(item.get("heart_rate")) for item in records) if rate]
    return FitSwim(
        day=start.date(),
        start=start.time().replace(microsecond=0),
        pool_m=pool,
        distance_m=distance,
        duration_s=timer,
        elapsed_s=_float(session.get("total_elapsed_time")) or timer,
        avg_hr=_int(session.get("avg_heart_rate"))
        or (round(sum(heart) / len(heart)) if heart else None),
        max_hr=_int(session.get("max_heart_rate")) or (max(heart) if heart else None),
        strokes=_strokes(session),
        calories=_int(session.get("total_calories")),
        laps=read_laps,
    )


def check_sport(session: dict[str, object]) -> None:
    """La piscine seulement. L'eau libre est refusée **en toutes lettres** : une sortie sans
    longueurs n'a rien à faire dans un carnet de tours (§6.3)."""
    sport = session.get("sport")
    sub = session.get("sub_sport")
    if sport != "swimming":
        label = str(sport).replace("_", " ") if sport else "inconnue"
        raise FitError(f"Ce fichier décrit une sortie « {label} », pas une natation.")
    if sub == "open_water":
        raise FitError(
            "Une natation en eau libre n'a pas de longueurs : seule la piscine s'importe."
        )


def _length(raw: dict[str, object]) -> FitLength:
    active = raw.get("length_type") == "active"
    stroke = raw.get("swim_stroke")
    return FitLength(
        active=active,
        duration_s=_float(raw.get("total_timer_time")) or 0.0,
        stroke=STROKES.get(stroke) if isinstance(stroke, str) else None,
        strokes=_int(raw.get("total_strokes")),
    )


def _lap(raw: dict[str, object], lengths: Sequence[FitLength]) -> FitSwimLap:
    distance = _float(raw.get("total_distance")) or 0.0
    first = _int(raw.get("first_length_index"))
    count = _int(raw.get("num_lengths")) or 0
    own = list(lengths[first : first + count]) if first is not None else []
    active = [item for item in own if item.active]
    return FitSwimLap(
        kind="swim" if distance > 0 else "rest",
        distance_m=distance,
        duration_s=_float(raw.get("total_timer_time")) or 0.0,
        idle_s=round(sum(item.duration_s for item in own if not item.active), 1),
        detected=[item.stroke or "?" for item in active],
        strokes=_strokes(raw),
        avg_hr=_int(raw.get("avg_heart_rate")),
        max_hr=_int(raw.get("max_heart_rate")),
    )


def _flag_suspects(
    laps: list[FitSwimLap], lengths: Sequence[FitLength], raw_laps: Sequence[dict[str, object]]
) -> None:
    """Marque les tours qui portent une longueur douteuse (§6.2). Ne corrige rien."""
    active = [item.duration_s for item in lengths if item.active and item.duration_s > 0]
    if not active:
        return
    threshold = median(active) * SUSPECT_SHARE
    for lap, raw in zip(laps, raw_laps, strict=True):
        first = _int(raw.get("first_length_index"))
        count = _int(raw.get("num_lengths")) or 0
        if first is None or lap.kind != "swim":
            continue
        lap.suspect = any(
            item.active
            and item.duration_s < threshold
            and item.strokes is not None
            and item.strokes < SUSPECT_STROKES
            for item in lengths[first : first + count]
        )


def _strokes(raw: dict[str, object]) -> int | None:
    """Les coups de bras. `total_strokes` est la lecture nage de `total_cycles`, que le
    décodeur ne résout que si le message porte son sport : on prend l'un ou l'autre."""
    return _int(raw.get("total_strokes", raw.get("total_cycles")))


def _float(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) else None


def _int(value: object) -> int | None:
    return round(value) if isinstance(value, int | float) else None


# ── La réécriture dans la notation (§6.4) ─────────────


@dataclass(frozen=True)
class LapView:
    """Ce que la réécriture lit d'un tour stocké — indépendant du fichier qui l'a produit."""

    kind: str
    distance_m: float
    duration_s: float
    detected: tuple[str, ...]
    corrected: str | None
    suspect: bool


@dataclass(frozen=True)
class Rewritten:
    """Une ligne réécrite : `4×50 CR R~40`, et ce qu'elle a de douteux."""

    text: str
    distance_m: int
    #: Rangs des tours qu'elle regroupe, pour aller corriger le bon.
    laps: tuple[int, ...]
    suspect: bool
    #: Vrai si la nage écrite n'est **ni** corrigée **ni** homogène : la montre l'a lue,
    #: personne ne l'a confirmée.
    detected: bool


def stroke_of(lap: LapView, dominant: str) -> tuple[str, bool]:
    """La nage à écrire pour un tour, et si elle n'est qu'une lecture de la montre.

    La correction d'abord. Sinon la nage détectée si le tour est homogène. Sinon la nage
    majoritaire du tour, et à égalité celle de la séance — « BR CR » sur un 50 m est un
    crawl dont la coulée a été mal lue, et c'est le crawl qui domine la séance.
    """
    if lap.corrected:
        return lap.corrected, False
    known = [code for code in lap.detected if code != "?"]
    if not known:
        return dominant, True
    if len(set(known)) == 1:
        return known[0], False
    counts = Counter(known).most_common()
    best = counts[0][1]
    leaders = [code for code, count in counts if count == best]
    return (dominant if dominant in leaders else leaders[0]), True


def dominant_stroke(laps: Sequence[LapView]) -> str:
    """La nage la plus nagée de la séance, en longueurs détectées ou corrigées."""
    counts: Counter[str] = Counter()
    for lap in laps:
        if lap.kind != "swim":
            continue
        if lap.corrected:
            counts[lap.corrected] += max(len(lap.detected), 1)
        else:
            counts.update(code for code in lap.detected if code != "?")
    return counts.most_common(1)[0][0] if counts else "CR"


def rewrite(laps: Sequence[LapView]) -> list[Rewritten]:
    """Les tours d'une séance, réécrits dans la notation du planning.

    Chaque tour nagé emporte le repos qui le suit — la somme des tours de repos jusqu'au
    prochain tour nagé. Des tours consécutifs de même distance et de même nage, aux repos
    à 15 s près, se regroupent : `4×50 CR R~40`. Le tilde dit « moyenne » ; il n'existe
    qu'en sortie, et le formulaire du planning le refuse.

    **Un tour douteux ne se regroupe jamais** : le noyer dans un `4×50` effacerait ce
    qu'on vient de signaler.
    """
    dominant = dominant_stroke(laps)
    swims: list[tuple[int, LapView, str, bool, float | None]] = []
    for index, lap in enumerate(laps):
        if lap.kind != "swim":
            continue
        rest = 0.0
        seen_rest = False
        for after in laps[index + 1 :]:
            if after.kind == "swim":
                break
            rest += after.duration_s
            seen_rest = True
        code, detected = stroke_of(lap, dominant)
        swims.append((index, lap, code, detected, rest if seen_rest else None))

    lines: list[Rewritten] = []
    group: list[tuple[int, LapView, str, bool, float | None]] = []

    def close() -> None:
        if not group:
            return
        first = group[0]
        count = len(group)
        distance = round(first[1].distance_m)
        rests = [item[4] for item in group if item[4] is not None]
        parts = [f"{count}×{distance}" if count > 1 else str(distance), first[2]]
        if rests:
            mean = sum(rests) / len(rests)
            rounded = max(REST_STEP_S, round(mean / REST_STEP_S) * REST_STEP_S)
            varied = len({round(rest / REST_STEP_S) for rest in rests}) > 1
            parts.append(f"R{'~' if varied else ''}{format_clock(rounded)}")
        lines.append(
            Rewritten(
                text=" ".join(parts),
                distance_m=distance * count,
                laps=tuple(item[0] for item in group),
                suspect=any(item[1].suspect for item in group),
                detected=any(item[3] for item in group),
            )
        )
        group.clear()

    for item in swims:
        if group:
            head = group[0]
            joins = (
                not item[1].suspect
                and not head[1].suspect
                and round(item[1].distance_m) == round(head[1].distance_m)
                and item[2] == head[2]
                and (item[4] is None or head[4] is None or abs(item[4] - head[4]) <= GROUP_REST_S)
            )
            if not joins:
                close()
        group.append(item)
        if item[1].suspect:
            close()
    close()
    return lines


__all__ = [
    "STROKES",
    "FitSwim",
    "FitSwimLap",
    "LapView",
    "Rewritten",
    "check_sport",
    "dominant_stroke",
    "read",
    "rewrite",
    "stroke_of",
]
