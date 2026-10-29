"""La charge globale, tous sports (`docs/charge-multisport.md` §3).

Module **pur** : des séances datées en entrée, des chiffres et leurs phrases en sortie. Ni
fichier, ni horloge — le jour est passé en argument.

## Une seule échelle : la sRPE

La charge d'une séance est son **effort perçu × ses minutes** (Foster 2001). C'est la seule
mesure commune à une course, une nage, un circuit et une sortie à vélo. Une séance sans
effort perçu n'a **pas** de charge : elle est comptée à part et nommée, jamais devinée —
une valeur devinée dans une courbe qu'on lit comme une mesure serait une valeur inventée.

**Une exception, décidée par l'utilisateur le 28 octobre (M-02, point 4)** : une course
avec FC entre par sa charge FC convertie, sur un facteur appris de ses propres courses
notées (`estimate.py`). Elle n'est pas devinée : elle est **estimée**, et chaque phrase qui
la compte le dit — « estimée depuis la FC ». L'effort perçu, noté, la remplace.

## Les modèles

* **Forme, fatigue, fraîcheur** (Banister) : CTL et ATL sont des moyennes exponentielles de
  la charge du jour, de constantes 42 et 7 jours — `CTL_t = CTL_{t-1} + (L_t - CTL_{t-1})/42`.
  La fraîcheur du jour est `CTL - ATL` **de la veille** : elle dit dans quel état on aborde
  la journée, pas dans quel état la séance du jour nous a laissés.
* **Rapport aigu/chronique** en moyennes exponentielles (Williams 2017), λ = 2/(N+1) sur 7
  et 28 jours. Un signal parmi d'autres : sa validité est débattue (Impellizzeri 2020), et
  il ne décide rien seul.
* **Monotonie et contrainte** (Foster 1998), sur les 7 derniers jours, jours sans séance
  compris : une semaine où tous les jours se ressemblent fatigue plus que sa somme.

Tous les seuils sont des constantes nommées : les sources sont citées de mémoire par le
cahier des charges, et chacune se vérifie avant d'être crue.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from statistics import mean, pstdev

from app.core.text import whole
from app.domains.training.estimate import MIN_PAIRS, Calibration

CTL_DAYS = 42
ATL_DAYS = 7
ACUTE_DAYS = 7
CHRONIC_DAYS = 28
#: Le rapport n'a de sens qu'avec une chronique entière.
RATIO_MIN_HISTORY_DAYS = 28
RATIO_HOLD = 1.3
RATIO_EASY_ONLY = 1.5
#: Au-delà, la semaine est monotone (Foster 1998).
MONOTONY_HIGH = 2.0
#: Points de la courbe rendus à l'écran.
SERIES_DAYS = 120
WEEKS_SHOWN = 8
#: Les séances sans effort perçu sont comptées sur cette fenêtre.
UNRATED_DAYS = 28

#: Les sports, dans l'ordre où l'écran les empile.
SPORTS: tuple[str, ...] = ("course", "natation", "renfo", "vélo", "marche", "randonnée")


@dataclass(frozen=True, slots=True)
class Session:
    day: date
    sport: str
    minutes: float
    rpe: int | None = None
    #: La sRPE estimée depuis la FC (`estimate.py`) — une course sans effort perçu, une fois
    #: le facteur calibré. Ignorée dès que l'effort perçu est noté : la mesure remplace.
    estimated: float | None = None
    #: La charge FC de la course, estimée ou non : de quoi dire qu'elle **attend** un
    #: facteur, plutôt que la ranger avec les séances qu'aucune mesure ne permet de compter.
    hr_load: float | None = None

    @property
    def load(self) -> float | None:
        if self.rpe is not None:
            return round(self.rpe * self.minutes, 1)
        return self.estimated

    @property
    def is_estimated(self) -> bool:
        return self.rpe is None and self.estimated is not None

    @property
    def awaits_calibration(self) -> bool:
        return self.rpe is None and self.estimated is None and self.hr_load is not None


@dataclass(frozen=True, slots=True)
class Point:
    day: date
    load: float
    ctl: float
    atl: float
    tsb: float


@dataclass(frozen=True, slots=True)
class Week:
    start: date
    #: Minutes par sport, toutes séances comptées — notées ou non : le volume est une durée,
    #: il n'a pas besoin d'effort perçu.
    minutes: dict[str, float]
    #: La charge sRPE de la semaine : séances notées, et courses estimées depuis la FC.
    load: float


@dataclass(frozen=True, slots=True)
class Summary:
    history_days: int = 0
    ctl: float | None = None
    atl: float | None = None
    tsb: float | None = None
    #: Les trois chiffres arrondis **une fois** (`text.whole`) : les tuiles et la phrase.
    form: int | None = None
    fatigue: int | None = None
    freshness: int | None = None
    form_text: str = ""
    ratio: float | None = None
    ratio_text: str = ""
    monotony: float | None = None
    strain: float | None = None
    monotony_text: str = ""
    #: Séances des 4 semaines **hors** de la charge : sans effort perçu ni estimation.
    unrated: dict[str, int] = field(default_factory=dict)
    unrated_text: str = ""
    #: Séances des 4 semaines comptées par leur estimation depuis la FC, par sport.
    estimated: dict[str, int] = field(default_factory=dict)
    #: Ce qu'elles pèsent et d'où vient le facteur — ou ce qu'il manque pour estimer.
    estimated_text: str = ""
    #: La même chose en une ligne, pour les constats qui citent la charge : la raison du
    #: coach, l'avertissement du planning. Vide sans estimation.
    estimated_note: str = ""
    series: list[Point] = field(default_factory=list)
    weeks: list[Week] = field(default_factory=list)


def summarize(
    today: date, sessions: Sequence[Session], calibration: Calibration | None = None
) -> Summary:
    past = [item for item in sessions if item.day <= today]
    unrated = _unrated(today, past)
    estimated = _estimated(today, past)
    awaiting = _awaiting(today, past)
    unrated_text = _unrated_text(unrated, estimated, _windowed(today, past))
    estimated_text = _estimated_text(estimated, awaiting, calibration)
    estimated_note = _estimated_note(estimated)
    weeks = _weeks(today, past)
    rated = [item for item in past if item.load is not None]
    if not rated:
        # Sans aucune séance, « aucune séance n'a d'effort perçu » laissait croire qu'il y
        # en avait (M-21, comme `_unrated_text`) : la phrase dit qu'il n'y a rien.
        missing = "aucune séance n'a d'effort perçu" if past else "aucune séance enregistrée"
        # Des courses avec FC attendent le facteur : l'accueil le dit, sans quoi « pas de
        # charge » se lisait à côté de la charge de course de la page Courses (M-02).
        waiting = (
            f" Tes courses avec FC y entreront, estimées depuis la FC, à {MIN_PAIRS} "
            "courses notées avec FC."
            if awaiting
            else ""
        )
        return Summary(
            form_text=(
                f"Pas encore de charge globale : {missing}. "
                f"Note l'effort de ta prochaine séance, et la courbe commence.{waiting}"
            ),
            ratio_text="Pas de rapport de charge sans séance notée.",
            monotony_text="Pas de monotonie sans séance notée.",
            unrated=unrated,
            unrated_text=unrated_text,
            estimated=estimated,
            estimated_text=estimated_text,
            weeks=weeks,
        )

    daily = _daily(rated)
    first = min(daily)
    history = (today - first).days + 1
    points, acute, chronic = _walk(first, today, daily)
    current = points[-1]
    ratio = _ratio(acute, chronic, history)
    monotony, strain, monotony_text = _monotony(today, daily)

    return Summary(
        history_days=history,
        ctl=current.ctl,
        atl=current.atl,
        tsb=current.tsb,
        form=whole(current.ctl),
        fatigue=whole(current.atl),
        freshness=whole(current.tsb),
        form_text=_form_text(current, history, sum(estimated.values())),
        ratio=ratio,
        ratio_text=_ratio_text(ratio, history),
        monotony=monotony,
        strain=strain,
        monotony_text=monotony_text,
        unrated=unrated,
        unrated_text=unrated_text,
        estimated=estimated,
        estimated_text=estimated_text,
        estimated_note=estimated_note,
        series=points[-SERIES_DAYS:],
        weeks=weeks,
    )


# ── Le calcul ─────────────────────────────────────────


def _daily(sessions: Sequence[Session]) -> dict[date, float]:
    totals: dict[date, float] = {}
    for item in sessions:
        if item.load is not None:
            totals[item.day] = totals.get(item.day, 0.0) + item.load
    return totals


def _walk(first: date, today: date, daily: dict[date, float]) -> tuple[list[Point], float, float]:
    """Le jour par jour, depuis la première séance notée. Rend la courbe et les deux
    moyennes exponentielles du rapport aigu/chronique au jour courant."""
    ctl = atl = 0.0
    acute = chronic = 0.0
    lam_a, lam_c = 2 / (ACUTE_DAYS + 1), 2 / (CHRONIC_DAYS + 1)
    points: list[Point] = []
    day = first
    while day <= today:
        load = daily.get(day, 0.0)
        tsb = ctl - atl
        ctl += (load - ctl) / CTL_DAYS
        atl += (load - atl) / ATL_DAYS
        acute = lam_a * load + (1 - lam_a) * acute
        chronic = lam_c * load + (1 - lam_c) * chronic
        points.append(
            Point(
                day=day,
                load=round(load, 1),
                ctl=round(ctl, 1),
                atl=round(atl, 1),
                tsb=round(tsb, 1),
            )
        )
        day += timedelta(days=1)
    return points, acute, chronic


def _ratio(acute: float, chronic: float, history: int) -> float | None:
    if history < RATIO_MIN_HISTORY_DAYS or chronic <= 0:
        return None
    return round(acute / chronic, 2)


def _monotony(today: date, daily: dict[date, float]) -> tuple[float | None, float | None, str]:
    week = [daily.get(today - timedelta(days=offset), 0.0) for offset in range(7)]
    total = sum(week)
    if total <= 0:
        return None, None, "Aucune séance notée sur 7 jours : pas de monotonie à juger."
    spread = pstdev(week)
    if spread == 0:
        # Sept jours identiques et non nuls : la monotonie est infinie, ce qu'un nombre ne
        # dit pas honnêtement. On le dit en mots.
        return (
            None,
            None,
            "Sept jours de charge identique : la semaine est aussi monotone qu'elle peut "
            "l'être (Foster).",
        )
    monotony = round(mean(week) / spread, 2)
    strain = float(round(total * monotony))
    text = f"Monotonie {_fr(monotony)} sur 7 jours, contrainte {_fr(strain)} (Foster)."
    if monotony > MONOTONY_HIGH:
        text += (
            " Au-dessus de 2 : des jours trop semblables — alterne facile et dur, ou repose-toi."
        )
    return monotony, strain, text


def _weeks(today: date, sessions: Sequence[Session]) -> list[Week]:
    monday = today - timedelta(days=today.weekday())
    weeks: list[Week] = []
    for back in range(WEEKS_SHOWN - 1, -1, -1):
        start = monday - timedelta(weeks=back)
        inside = [item for item in sessions if start <= item.day < start + timedelta(days=7)]
        minutes = {
            sport: round(sum(item.minutes for item in inside if item.sport == sport), 1)
            for sport in SPORTS
        }
        weeks.append(
            Week(
                start=start,
                minutes={sport: value for sport, value in minutes.items() if value > 0},
                load=round(sum(item.load or 0.0 for item in inside), 1),
            )
        )
    return weeks


def _unrated(today: date, sessions: Sequence[Session]) -> dict[str, int]:
    return _count(today, [item for item in sessions if item.load is None])


def _estimated(today: date, sessions: Sequence[Session]) -> dict[str, int]:
    return _count(today, [item for item in sessions if item.is_estimated])


def _awaiting(today: date, sessions: Sequence[Session]) -> int:
    return sum(_count(today, [item for item in sessions if item.awaits_calibration]).values())


def _count(today: date, sessions: Sequence[Session]) -> dict[str, int]:
    since = today - timedelta(days=UNRATED_DAYS - 1)
    counts: dict[str, int] = {}
    for item in sessions:
        if item.day >= since:
            counts[item.sport] = counts.get(item.sport, 0) + 1
    return counts


def _windowed(today: date, sessions: Sequence[Session]) -> int:
    since = today - timedelta(days=UNRATED_DAYS - 1)
    return sum(1 for item in sessions if item.day >= since)


# ── Les phrases ───────────────────────────────────────


def _form_text(point: Point, history: int, estimated: int = 0) -> str:
    # Les trois chiffres comptent les courses estimées : la phrase qui les donne le dit, dans
    # la parenthèse du modèle — l'accueil ne lit qu'elle (M-02, point 4).
    plural = "s" if estimated > 1 else ""
    source = (
        f"Banister, dont {estimated} course{plural} des 4 semaines estimée{plural} depuis la FC"
        if estimated
        else "Banister"
    )
    head = (
        # Arrondies toutes trois, et par `whole` comme les tuiles au-dessus : « forme 71,
        # fatigue 94,9 » lisait une précision que l'une avait et l'autre pas ; « fatigue 6 »
        # sous une tuile à 7 venait de `round`, qui arrondit 6,5 au pair ; « fraîcheur
        # -34,9 » sous une tuile à -35, de la décimale gardée.
        f"Forme {whole(point.ctl)}, fatigue {whole(point.atl)}, "
        f"fraîcheur {_signed(whole(point.tsb))} "
        f"({source})."
    )
    if history < CTL_DAYS:
        return (
            head + f" La forme se construit sur 42 jours : {history} jours d'historique noté, "
            "elle sous-estime encore ton niveau."
        )
    if point.tsb < -30:
        return head + " La fatigue dépasse nettement la forme : semaine de surcharge."
    if point.tsb < -10:
        return head + " Fatigue au-dessus de la forme : une charge qui construit, à surveiller."
    if point.tsb <= 5:
        return head + " Forme et fatigue s'équilibrent."
    return head + " Plus frais que fatigué : de la marge pour charger, ou pour courir vite."


def _ratio_text(ratio: float | None, history: int) -> str:
    if ratio is None:
        if history < RATIO_MIN_HISTORY_DAYS:
            return (
                f"Pas encore de rapport aigu/chronique global : 28 jours d'historique noté "
                f"nécessaires, encore {RATIO_MIN_HISTORY_DAYS - history}."
            )
        return "Pas de rapport aigu/chronique : aucune charge sur quatre semaines."
    written = _fr(ratio)
    base = f"Rapport aigu/chronique tous sports : {written} (moyennes exponentielles)."
    if ratio >= RATIO_EASY_ONLY:
        return base + " Au-dessus de 1,5 : la charge monte trop vite, du facile seulement."
    if ratio >= RATIO_HOLD:
        return base + " Au-dessus de 1,3 : on ne monte plus."
    if ratio < 0.8:
        return base + " Sous 0,8 : une période légère."
    return base


def _unrated_text(unrated: dict[str, int], estimated: dict[str, int], windowed: int) -> str:
    # Sans aucune séance, « toutes ont un effort perçu » est vrai au sens logique et se lit
    # comme une mesure (M-21) : la phrase se tait, et l'écran n'en dessine pas.
    if windowed == 0:
        return ""
    total = sum(unrated.values())
    if total == 0:
        # Une course estimée n'a pas d'effort perçu : « toutes en ont un » serait faux, et
        # `estimated_text` dit déjà ce qu'elle pèse.
        if estimated:
            return ""
        return "Toutes les séances des 4 semaines ont un effort perçu."
    # « 3 courses », et non « 3 course » : vu sur le banc de M-02, point 4.
    parts = ", ".join(
        f"{count} {sport}{'s' if count > 1 else ''}" for sport, count in unrated.items()
    )
    plural = "s" if total > 1 else ""
    return (
        f"{total} séance{plural} des 4 semaines sans effort perçu ({parts}) : "
        f"elle{plural} ne compte{'nt' if total > 1 else ''} pas dans la charge globale."
    )


def _estimated_text(
    estimated: dict[str, int], awaiting: int, calibration: Calibration | None
) -> str:
    count = sum(estimated.values())
    if count and calibration is not None and calibration.factor is not None:
        many = count > 1
        return (
            f"{count} course{'s' if many else ''} des 4 semaines sans effort perçu "
            f"compte{'nt' if many else ''} par {'leur' if many else 'sa'} charge FC, "
            f"estimée depuis la FC : × {calibration.written}, la médiane de tes "
            f"{calibration.pairs} courses notées avec FC. Noter "
            f"{'leur' if many else 'son'} effort perçu remplace l'estimation."
        )
    if awaiting and calibration is not None:
        many = awaiting > 1
        so_far = f"{calibration.pairs} pour l'instant" if calibration.pairs else "aucune encore"
        return (
            f"{awaiting} course{'s' if many else ''} avec FC sans effort perçu : "
            f"{'elles entreront' if many else 'elle entrera'} dans la charge globale, "
            f"estimée{'s' if many else ''} depuis la FC, à {MIN_PAIRS} courses notées avec "
            f"FC — {so_far}."
        )
    return ""


def _estimated_note(estimated: dict[str, int]) -> str:
    count = sum(estimated.values())
    if not count:
        return ""
    return (
        f"Charge en partie estimée depuis la FC : {count} course{'s' if count > 1 else ''} "
        "sans effort perçu sur 4 semaines."
    )


def _fr(value: float) -> str:
    if math.isclose(value, round(value)):
        return str(round(value))
    return f"{value:.1f}".replace(".", ",")


def _signed(value: float) -> str:
    text = _fr(abs(value))
    return f"\u2212{text}" if value < 0 else f"+{text}" if value > 0 else "0"
