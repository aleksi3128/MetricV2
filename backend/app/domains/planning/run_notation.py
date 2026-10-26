"""La notation d'une séance de course, lue par le serveur (`docs/planifier-une-seance.md`,
D1–D3).

Module **pur** : un texte et des références (FC max, allure seuil) en entrée ; des blocs
réécrits avec leur cible, la distance et la durée totales, ou la faute, en sortie.

## La notation

C'est celle du plan de course (`docs/plan-course.md`, D6), qui n'était lue qu'à l'œil :

    15' EF + 5 × (1 km 6'00 + 80 m LD 3'30) + 10' RC
    3 × 8' T r2'
    1 km en 4'10 RPE8

* **Un bloc** : une quantité — `1 km`, `800 m`, `15'`, `45'30`, `1h10` —, un sigle
  facultatif (`EF`, `SL`, `T`, `VMA`, `AS5`, `AS10`, `ASS`, `ASM`, `LD`, `RC`), et des
  cibles facultatives : une allure `6'00` ou une plage `5'40-5'50` (par kilomètre), un
  temps de bloc `en 4'10`, une FC `140-150` (bpm), une zone `Z2`, un effort `RPE7`.
* **Un groupe** : `5 × ( … )`, ou `5 × 1 km VMA` pour un seul bloc ; une récupération
  `r1'30` ou `r200 m` après le groupe se court **après chaque répétition** — comme la
  montre la joue.
* `+` sépare les blocs ; un retour à la ligne aussi.

Le pouce tape `x` pour `×`, `’` ou `"` pour `'`, `6"0'` pour `6'00` : tout cela se lit.

## Les cibles

Une cible **écrite** l'emporte. Sans elle, un sigle prend la plage de **sa zone**, allure
et FC, calculées depuis les références — les zones d'aujourd'hui, comme le coach. Sans
référence, le bloc reste sans chiffre, et la phrase le dit. Une allure seule `6'00` se
juge à cinq secondes près, de part et d'autre.

## Les totaux

La distance et la durée se déduisent l'une de l'autre **par l'allure du bloc**. Un bloc
sans allure laisse le total inconnu, et le dit : un total calculé sur une partie de la
séance serait un chiffre faux présenté comme juste — la règle de la nage.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field

from app.domains.activity.analysis import HR_BOUNDS, PACE_BOUNDS, clock
from app.domains.coach.catalog import References

MAX_CHARS = 600
#: Une allure seule se juge à cinq secondes près, de part et d'autre.
PACE_TOLERANCE_MIN = 5 / 60

#: Le sigle, son nom, et sa zone (1 à 5) — celle que le coach donne à la même allure.
CODES: dict[str, tuple[str, int]] = {
    "EF": ("endurance fondamentale", 2),
    "SL": ("sortie longue", 2),
    "RC": ("retour au calme", 1),
    "T": ("seuil", 4),
    "VMA": ("VMA", 5),
    "AS5": ("allure 5 km", 5),
    "AS10": ("allure 10 km", 4),
    "ASS": ("allure semi", 4),
    "ASM": ("allure marathon", 3),
    "LD": ("ligne droite", 5),
}

Kind = Literal["warmup", "run", "recover", "cooldown"]


# ── Ce qui sort ───────────────────────────────────────


class RunLine(BaseModel):
    """Une ligne lue, réécrite : l'écran l'affiche sans rien recomposer."""

    depth: int
    kind: Literal["block", "group", "recovery"]
    text: str


class RunError(BaseModel):
    #: Le morceau fautif tel qu'il a été tapé, ou `null` si la séance entière est en cause.
    token: str | None = None
    message: str


class RunProgram(BaseModel):
    lines: list[RunLine] = Field(default_factory=list)
    errors: list[RunError] = Field(default_factory=list)
    #: La forme canonique, celle qui s'enregistre et se recharge.
    notation: str = ""
    distance_m: int | None = None
    duration_s: int | None = None
    #: « 7,9 km · 52 min », ou ce qui manque pour le dire.
    summary: str = ""

    @property
    def valid(self) -> bool:
        return not self.errors


# ── L'arbre lu ────────────────────────────────────────


@dataclass
class Target:
    pace_slow: float | None = None
    pace_fast: float | None = None
    #: L'allure seule écrite, pour la réécrire telle quelle (« à 6:00 /km »).
    pace_exact: float | None = None
    hr_low: int | None = None
    hr_high: int | None = None
    rpe: int | None = None


@dataclass
class Block:
    distance_m: float | None = None
    duration_s: float | None = None
    code: str | None = None
    zone: int | None = None
    target: Target = field(default_factory=Target)
    #: `en 4'10` : le temps du bloc entier, écrit tel quel.
    block_time_s: float | None = None
    kind: Kind = "run"


@dataclass
class Group:
    count: int
    children: list[Node]
    recovery: Block | None = None


Node = Block | Group


class NotationError(Exception):
    def __init__(self, message: str, token: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.token = token


# ── La lecture ────────────────────────────────────────

_APOSTROPHES = str.maketrans(dict.fromkeys('\u2019\u2018\u2032\u2033\u00b4`"\u201c\u201d', "'"))
_TIMES = re.compile(r"(\d)\s*[xX×*]\s*(?=[\d(])")
_TOKENS = re.compile(r"\(|\)|\+|×|[^\s()+×]+")
_NUMBER = r"\d+(?:[.,]\d+)?"
_DISTANCE = re.compile(rf"^({_NUMBER})(km|m)$", re.IGNORECASE)
_CLOCK = re.compile(r"^(\d{1,3})'(\d{1,2})?'?$")
_HOURS = re.compile(r"^(\d{1,2})h(\d{2})?$", re.IGNORECASE)
_PACE_RANGE = re.compile(r"^(\d{1,2}'\d{0,2}'?)-(\d{1,2}'\d{0,2}'?)$")
_HR = re.compile(r"^(\d{2,3})-(\d{2,3})(?:bpm)?$", re.IGNORECASE)
_ZONE = re.compile(r"^Z([1-5])$", re.IGNORECASE)
_RPE = re.compile(r"^RPE(\d{1,2})$", re.IGNORECASE)
_RECOVERY = re.compile(r"^r(.+)$", re.IGNORECASE)
_CONNECTORS = {"à", "a", "@"}


def normalise(text: str) -> str:
    """La typographie du pouce ramenée à la forme lue : `×`, `'`, des `+` à la place des
    retours à la ligne, et l'unité collée au nombre (`1 km` → `1km`)."""
    lines = [line.strip() for line in text.translate(_APOSTROPHES).splitlines() if line.strip()]
    joined = " + ".join(lines)
    joined = _TIMES.sub(r"\1 × ", joined)
    joined = re.sub(rf"({_NUMBER})\s+(km|m)\b", r"\1\2", joined, flags=re.IGNORECASE)
    joined = re.sub(r"\b(rpe)\s+(\d)", r"\1\2", joined, flags=re.IGNORECASE)
    joined = re.sub(r"\b([rR])\s+(?=\d)", r"\1", joined)
    joined = re.sub(r"\s*-\s*", "-", joined)
    return re.sub(r"\s+", " ", joined).strip()


def _float(raw: str) -> float:
    return float(raw.replace(",", "."))


def clock_value(token: str) -> float | None:
    """`6'00` → 6.0 minutes ; `6'0'` → 6.0 ; `45'30` → 45.5 ; `15'` → 15. Les secondes
    s'écrivent sur deux chiffres, sauf `0` : `6'5` est ambigu, et refusé."""
    match = _CLOCK.match(token)
    if match is None:
        return None
    minutes, seconds = match.group(1), match.group(2)
    if seconds is None:
        return float(minutes)
    if len(seconds) == 1 and seconds != "0":
        raise NotationError("Les secondes s'écrivent sur deux chiffres : 6'05 ou 6'50.", token)
    value = int(seconds)
    if value >= 60:
        raise NotationError("Une minute n'a que soixante secondes.", token)
    return int(minutes) + value / 60


def _quantity(token: str) -> tuple[float | None, float | None] | None:
    """(distance en mètres, durée en secondes), ou `None` si ce n'est pas une quantité."""
    if (match := _DISTANCE.match(token)) is not None:
        value = _float(match.group(1))
        return (value * 1000 if match.group(2).lower() == "km" else value), None
    if (match := _HOURS.match(token)) is not None:
        return None, (int(match.group(1)) * 60 + int(match.group(2) or 0)) * 60.0
    minutes = clock_value(token)
    if minutes is not None:
        return None, minutes * 60
    return None


class _Reader:
    def __init__(self, tokens: list[str]) -> None:
        self.tokens = tokens
        self.pos = 0

    def peek(self, offset: int = 0) -> str | None:
        index = self.pos + offset
        return self.tokens[index] if index < len(self.tokens) else None

    def take(self) -> str:
        token = self.tokens[self.pos]
        self.pos += 1
        return token

    def sequence(self, depth: int) -> list[Node]:
        nodes: list[Node] = []
        while True:
            nodes.append(self.item(depth))
            following = self.peek()
            if following is None or following == ")":
                return nodes
            if following != "+":
                raise NotationError("Il manque un « + » entre deux blocs.", following)
            self.take()
            if self.peek() is None:
                raise NotationError("La séance finit sur un « + » : un bloc manque.")

    def item(self, depth: int) -> Node:
        token = self.peek()
        if token is None:
            raise NotationError("Un bloc manque.")
        if token == "(":
            raise NotationError("Un groupe se répète : écris 5 × ( … ).", token)
        if token.isdigit() and self.peek(1) == "×":
            count = int(self.take())
            self.take()
            if not 1 <= count <= 50:
                raise NotationError("Entre 1 et 50 répétitions.", str(count))
            if self.peek() == "(":
                self.take()
                children = self.sequence(depth + 1)
                if self.peek() != ")":
                    raise NotationError("Une parenthèse ouverte n'est pas refermée.", "(")
                self.take()
            else:
                children = [self.block()]
            recovery = self.recovery()
            return Group(count=count, children=children, recovery=recovery)
        block = self.block()
        # `block()` ne s'arrête avant la fin qu'au « + », à la « ) », ou sur une vraie
        # récupération : c'est ce troisième cas qui n'a rien à faire après un bloc seul.
        if self.peek() not in (None, "+", ")"):
            raise NotationError(
                "Une récupération va avec des répétitions : 5 × 1 km VMA r1'30.", self.peek()
            )
        return block

    def recovery(self) -> Block | None:
        token = self.peek()
        if token is None:
            return None
        match = _RECOVERY.match(token)
        if match is None or _quantity(match.group(1)) is None:
            return None
        self.take()
        quantity = _quantity(match.group(1))
        assert quantity is not None
        return Block(distance_m=quantity[0], duration_s=quantity[1], zone=1, kind="recover")

    def block(self) -> Block:
        token = self.take()
        quantity = _quantity(token)
        if quantity is None:
            raise NotationError(
                "Un bloc commence par sa quantité : 1 km, 800 m, 15' ou 1h10.", token
            )
        block = Block(distance_m=quantity[0], duration_s=quantity[1])
        while (following := self.peek()) is not None and following not in {"+", ")"}:
            if _RECOVERY.match(following) and _quantity(following[1:]) is not None:
                break
            self.take()
            self.modifier(block, following)
        return block

    def modifier(self, block: Block, token: str) -> None:
        upper = token.upper()
        target = block.target
        if token.lower() in _CONNECTORS:
            return
        if token.lower() == "en":
            raw = self.peek()
            minutes = clock_value(raw) if raw is not None else None
            if raw is None or minutes is None:
                raise NotationError("« en » attend le temps du bloc : 1 km en 4'10.", token)
            self.take()
            if block.distance_m is None:
                raise NotationError(
                    "« en » va avec une distance : 1 km en 4'10, pas 15' en 4'10.", raw
                )
            block.block_time_s = minutes * 60
            pace = minutes / (block.distance_m / 1000)
            target.pace_exact = pace
            return
        if upper in CODES:
            # SL est la sortie longue (`docs/plan-course.md`, D6) ; écrit sur moins d'un
            # kilomètre, c'est presque sûrement une ligne droite — on le dit plutôt que de
            # ranger « 80 m de sortie longue ».
            if upper == "SL" and block.distance_m is not None and block.distance_m < 1000:
                raise NotationError(
                    "SL est la sortie longue ; une ligne droite s'écrit LD : 80 m LD 3'30.",
                    token,
                )
            block.code = upper
            block.zone = block.zone or CODES[upper][1]
            return
        if (match := _ZONE.match(token)) is not None:
            block.zone = int(match.group(1))
            return
        if (match := _RPE.match(token)) is not None:
            value = int(match.group(1))
            if not 1 <= value <= 10:
                raise NotationError("L'effort perçu va de 1 à 10.", token)
            target.rpe = value
            return
        if (match := _PACE_RANGE.match(token)) is not None:
            first, second = clock_value(match.group(1)), clock_value(match.group(2))
            assert first is not None and second is not None
            target.pace_fast, target.pace_slow = sorted((first, second))
            return
        if (match := _HR.match(token)) is not None:
            low, high = sorted((int(match.group(1)), int(match.group(2))))
            if not 60 <= low <= high <= 230:
                raise NotationError("Une FC se tient entre 60 et 230 bpm.", token)
            target.hr_low, target.hr_high = low, high
            return
        written = clock_value(token)
        if written is not None:
            if not 2 <= written <= 15:
                raise NotationError("Une allure au kilomètre se tient entre 2'00 et 15'00.", token)
            target.pace_exact = written
            return
        raise NotationError(
            "Inconnu. Sigles : EF, SL, T, VMA, AS5, AS10, ASS, ASM, LD, RC ; cibles : 6'00, "
            "5'40-5'50, en 4'10, 140-150, Z2, RPE7.",
            token,
        )


def read_tree(text: str) -> list[Node]:
    """L'arbre d'une séance, ou `NotationError`."""
    cleaned = normalise(text)
    if not cleaned:
        return []
    reader = _Reader(_TOKENS.findall(cleaned))
    nodes = reader.sequence(0)
    if reader.peek() is not None:
        raise NotationError("Une parenthèse fermée n'a pas été ouverte.", reader.peek())
    return nodes


# ── Les cibles ────────────────────────────────────────


def _zone_pace(zone: int, refs: References) -> tuple[float | None, float | None]:
    """(la plus lente, la plus rapide) d'une zone, en min/km — `analysis.PACE_BOUNDS`."""
    if refs.threshold is None:
        return None, None
    bounds = (None, *PACE_BOUNDS, None)
    slow, fast = bounds[zone - 1], bounds[zone]
    return (
        round(refs.threshold * slow, 3) if slow is not None else None,
        round(refs.threshold * fast, 3) if fast is not None else None,
    )


def _zone_hr(zone: int, refs: References) -> tuple[int | None, int | None]:
    if refs.max_hr is None:
        return None, None
    bounds = (None, *HR_BOUNDS, None)
    low, high = bounds[zone - 1], bounds[zone]
    return (
        round(refs.max_hr * low) if low is not None else None,
        round(refs.max_hr * high) - 1 if high is not None else None,
    )


def resolve(block: Block, refs: References) -> Target:
    """La cible effective : l'écrite l'emporte, la zone comble le reste."""
    written = block.target
    target = Target(rpe=written.rpe)
    if written.pace_exact is not None:
        target.pace_exact = written.pace_exact
        target.pace_slow = written.pace_exact + PACE_TOLERANCE_MIN
        target.pace_fast = written.pace_exact - PACE_TOLERANCE_MIN
    elif written.pace_slow is not None:
        target.pace_slow, target.pace_fast = written.pace_slow, written.pace_fast
    elif block.zone is not None:
        target.pace_slow, target.pace_fast = _zone_pace(block.zone, refs)
    zone = block.zone
    if zone is None and target.pace_exact is not None and refs.threshold is not None:
        # Une allure écrite sans sigle tombe dans une zone : sa plage de FC en vient.
        zone = 1 + sum(1 for bound in PACE_BOUNDS if target.pace_exact / refs.threshold < bound)
    if written.hr_low is not None:
        target.hr_low, target.hr_high = written.hr_low, written.hr_high
    elif zone is not None:
        target.hr_low, target.hr_high = _zone_hr(zone, refs)
    return target


def _middle_pace(target: Target) -> float | None:
    if target.pace_exact is not None:
        return target.pace_exact
    if target.pace_slow is not None and target.pace_fast is not None:
        return (target.pace_slow + target.pace_fast) / 2
    return target.pace_slow or target.pace_fast


# ── L'écriture ────────────────────────────────────────


def _quantity_text(block: Block) -> str:
    if block.distance_m is not None:
        meters = block.distance_m
        if meters >= 1000:
            km = f"{meters / 1000:g}".replace(".", ",")
            return f"{km} km"
        return f"{round(meters)} m"
    seconds = round(block.duration_s or 0)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours} h {minutes:02d}" if minutes else f"{hours} h"
    return f"{minutes} min {secs:02d}" if secs else f"{minutes} min"


#: Insécables : une plage ne se coupe ni après son tiret, ni avant son unité, et
#: « au-dessus » ne se casse pas sur son trait d'union — vu à 360 px.
_NBSP = "\u00a0"
_JOIN = "\u2060"
_HYPHEN = "\u2011"


def _range(low: str, high: str, unit: str) -> str:
    return f"{low}–{_JOIN}{high}{_NBSP}{unit}"


def _target_text(target: Target) -> str:
    parts: list[str] = []
    per_km = f"{_NBSP}/km"
    if target.pace_exact is not None:
        parts.append(f"à {clock(target.pace_exact)}{per_km}")
    elif target.pace_slow is not None and target.pace_fast is not None:
        parts.append(_range(clock(target.pace_fast), clock(target.pace_slow), "/km"))
    elif target.pace_fast is not None:
        parts.append(f"plus lent que {clock(target.pace_fast)}{per_km}")
    elif target.pace_slow is not None:
        parts.append(f"plus vite que {clock(target.pace_slow)}{per_km}")
    if target.hr_low is not None and target.hr_high is not None:
        parts.append(_range(str(target.hr_low), str(target.hr_high), "bpm"))
    elif target.hr_high is not None:
        parts.append(f"sous {target.hr_high + 1}{_NBSP}bpm")
    elif target.hr_low is not None:
        parts.append(f"au{_HYPHEN}dessus de {target.hr_low}{_NBSP}bpm")
    if target.rpe is not None:
        parts.append(f"effort {target.rpe}/10")
    return " · ".join(parts)


def _block_text(block: Block, refs: References) -> str:
    head = _quantity_text(block)
    if block.code is not None:
        head += f" {CODES[block.code][0]}"
    elif block.kind == "recover":
        head = f"récupération {head}"
    if block.block_time_s is not None:
        head += f" en {clock(block.block_time_s / 60)}"
    target = _target_text(resolve(block, refs))
    return f"{head} — {target}" if target else head


def _notation(nodes: Sequence[Node]) -> str:
    """La forme canonique : `15' EF + 5 × (1 km 6'00 + 80 m LD 3'30) + 10' RC`."""

    def quantity(block: Block) -> str:
        if block.distance_m is not None:
            if block.distance_m >= 1000:
                return f"{block.distance_m / 1000:g} km".replace(".", ",")
            return f"{round(block.distance_m)} m"
        seconds = round(block.duration_s or 0)
        minutes, secs = divmod(seconds, 60)
        if minutes >= 60 and not secs:
            hours, rest = divmod(minutes, 60)
            return f"{hours}h{rest:02d}" if rest else f"{hours}h"
        return f"{minutes}'{secs:02d}" if secs else f"{minutes}'"

    def pace(value: float) -> str:
        minutes = int(value)
        seconds = round((value - minutes) * 60)
        if seconds == 60:
            minutes, seconds = minutes + 1, 0
        return f"{minutes}'{seconds:02d}"

    def block(item: Block) -> str:
        parts = [quantity(item)]
        if item.code:
            parts.append(item.code)
        if item.zone is not None and (item.code is None or CODES[item.code][1] != item.zone):
            parts.append(f"Z{item.zone}")
        written = item.target
        if item.block_time_s is not None:
            parts.append(f"en {pace(item.block_time_s / 60)}")
        elif written.pace_exact is not None:
            parts.append(pace(written.pace_exact))
        elif written.pace_slow is not None and written.pace_fast is not None:
            parts.append(f"{pace(written.pace_fast)}-{pace(written.pace_slow)}")
        if written.hr_low is not None:
            parts.append(f"{written.hr_low}-{written.hr_high}")
        if written.rpe is not None:
            parts.append(f"RPE{written.rpe}")
        return " ".join(parts)

    def node(item: Node) -> str:
        if isinstance(item, Block):
            return block(item)
        inner = " + ".join(node(child) for child in item.children)
        body = (
            f"{item.count} × ({inner})"
            if len(item.children) > 1 or isinstance(item.children[0], Group)
            else f"{item.count} × {inner}"
        )
        if item.recovery is not None:
            body += f" r{quantity(item.recovery).replace(' ', '')}"
        return body

    return " + ".join(node(item) for item in nodes)


def _measure(block: Block, refs: References) -> tuple[float | None, float | None]:
    """(mètres, secondes) d'un bloc, l'une déduite de l'autre par son allure."""
    if block.distance_m is not None and block.duration_s is None:
        if block.block_time_s is not None:
            return block.distance_m, block.block_time_s
        pace = _middle_pace(resolve(block, refs))
        return block.distance_m, (block.distance_m / 1000 * pace * 60 if pace else None)
    pace = _middle_pace(resolve(block, refs))
    seconds = block.duration_s or 0
    return (seconds / 60 / pace * 1000 if pace else None), seconds


def _walk(
    nodes: Sequence[Node], refs: References, depth: int, lines: list[RunLine]
) -> tuple[float | None, float | None]:
    total_m: float | None = 0.0
    total_s: float | None = 0.0
    for item in nodes:
        if isinstance(item, Block):
            lines.append(RunLine(depth=depth, kind="block", text=_block_text(item, refs)))
            meters, seconds = _measure(item, refs)
        else:
            lines.append(RunLine(depth=depth, kind="group", text=f"{item.count} × :"))
            meters, seconds = _walk(item.children, refs, depth + 1, lines)
            if item.recovery is not None:
                lines.append(
                    RunLine(
                        depth=depth + 1,
                        kind="recovery",
                        text=f"{_block_text(item.recovery, refs)}, après chaque répétition",
                    )
                )
                rec_m, rec_s = _measure(item.recovery, refs)
                meters = meters + rec_m if meters is not None and rec_m is not None else None
                seconds = seconds + rec_s if seconds is not None and rec_s is not None else None
            meters = meters * item.count if meters is not None else None
            seconds = seconds * item.count if seconds is not None else None
        total_m = total_m + meters if total_m is not None and meters is not None else None
        total_s = total_s + seconds if total_s is not None and seconds is not None else None
    return total_m, total_s


def _summary(meters: float | None, seconds: float | None, refs: References) -> str:
    if meters is None and seconds is None:
        return "Distance et durée inconnues : un bloc n'a ni allure ni zone calculable."
    parts: list[str] = []
    if meters is not None:
        parts.append(f"{meters / 1000:.1f} km".replace(".", ","))
    if seconds is not None:
        minutes = round(seconds / 60)
        hours, rest = divmod(minutes, 60)
        parts.append(f"{hours} h {rest:02d}" if hours else f"{minutes} min")
    text = " · ".join(parts)
    if meters is None or seconds is None:
        missing = "la distance" if meters is None else "la durée"
        why = (
            "renseigne ton allure seuil dans les repères de la page des courses"
            if refs.threshold is None
            else "un bloc n'a pas d'allure"
        )
        text += f" — {missing} reste inconnue : {why}."
    return text


def parse(text: str, refs: References) -> RunProgram:
    """Lit une séance. Les totaux ne sont rendus que si elle est sans faute."""
    if len(text) > MAX_CHARS:
        return RunProgram(errors=[RunError(message=f"Une séance tient en {MAX_CHARS} caractères.")])
    try:
        nodes = read_tree(text)
    except NotationError as error:
        return RunProgram(errors=[RunError(token=error.token, message=error.message)])
    if not nodes:
        return RunProgram()
    lines: list[RunLine] = []
    meters, seconds = _walk(nodes, refs, 0, lines)
    return RunProgram(
        lines=lines,
        notation=_notation(nodes),
        distance_m=round(meters) if meters is not None else None,
        duration_s=round(seconds) if seconds is not None else None,
        summary=_summary(meters, seconds, refs),
    )


def describe_errors(errors: Sequence[RunError]) -> str:
    first = errors[0]
    return f"« {first.token} » : {first.message}" if first.token else first.message


def _zone_of(block: Block, refs: References) -> int | None:
    if block.zone is not None:
        return block.zone
    pace = block.target.pace_exact
    if pace is None and block.block_time_s is not None and block.distance_m:
        pace = block.block_time_s / 60 / (block.distance_m / 1000)
    if pace is None or refs.threshold is None:
        return None
    return 1 + sum(1 for bound in PACE_BOUNDS if pace / refs.threshold < bound)


def is_hard(text: str, refs: References) -> bool:
    """Une séance **dure** : un bloc de course en zone 4 ou plus — par son sigle, sa zone
    ou son allure écrite. Ce que les garde-fous de la planification surveillent (D9)."""
    try:
        nodes = read_tree(text)
    except NotationError:
        return False

    def walk(items: Sequence[Node]) -> bool:
        for item in items:
            if isinstance(item, Group):
                if walk(item.children):
                    return True
            elif item.kind == "run" and (_zone_of(item, refs) or 0) >= 4:
                return True
        return False

    return walk(nodes)
