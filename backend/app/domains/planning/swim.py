"""La notation d'une séance de natation (`docs/planning-natation.md` §2).

Module **pur** : un texte et un glossaire entrent, un programme lu sort. Il ne lit aucun
fichier et ne connaît pas l'horloge — c'est le même parti pris que `conversation.py`, avec
la même conséquence : chaque cas se vérifie sur une chaîne fixe, sans monter d'application.

## Pourquoi une grammaire stricte

La notation est ce que l'assistant **doit** écrire, et ce que le serveur doit pouvoir
refuser. Une lecture accommodante — ordre libre, synonymes, prose tolérée — rendrait le
refus impossible : « 50 R15 » dirait aussi bien quinze secondes de repos que quinze
répétitions. Chaque ligne est donc un titre de section ou un bloc, et rien d'autre.

## Ce qui est toléré quand même

La **typographie**, pas le vocabulaire. Un clavier de téléphone n'a pas de `×`, et iOS
remplace `'` par `’` sans le dire : refuser ces deux-là reviendrait à refuser tout ce qui se
tape au pouce. La casse et les accents ne font pas non plus un autre sigle. Un synonyme, en
revanche (`NL` pour `CR`), n'est jamais traduit — une table de synonymes apprendrait au
modèle que la notation se négocie.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

#: Catégories d'un sigle. L'ordre d'un bloc en découle : nage, allure, options.
Category = Literal["stroke", "pace", "option"]

CATEGORY_LABELS: dict[str, str] = {
    "stroke": "nage",
    "pace": "allure",
    "option": "option",
}

#: Bornes d'un programme. Au-delà de quarante lignes, ce n'est plus une séance mais un
#: carnet ; au-delà de 2 000 caractères, la cellule CSV devient illisible dans un tableur.
MAX_LINES = 40
MAX_CHARS = 2000

#: Une distance de bloc. Multiple de 25 : un bassin de 50 m reste couvert, et un « 30 » est
#: une faute de frappe, pas un exercice.
POOL_STEP = 25
MAX_DISTANCE = 2000
MAX_REPS = 50
#: Une récupération au-delà de dix minutes n'est plus une récupération, c'est une pause.
MAX_RECOVERY_S = 600

#: Longueur d'un sigle ajouté, une fois normalisé.
MAX_CODE = 4


@dataclass(frozen=True)
class SwimCode:
    """Un sigle du glossaire."""

    code: str
    label: str
    category: Category
    #: Livré avec l'application. Son libellé se renomme, il ne se supprime jamais.
    base: bool = True


#: Le glossaire livré (§2.4). Les ajouts de l'utilisateur vivent dans
#: `planning/swim_codes.csv` ; cette table-ci n'est jamais écrite nulle part, ce qui fait
#: qu'un fichier effacé rend la base au lieu de la perdre.
BASE_CODES: tuple[SwimCode, ...] = (
    SwimCode("CR", "crawl", "stroke"),
    SwimCode("DOS", "dos", "stroke"),
    SwimCode("BR", "brasse", "stroke"),
    SwimCode("PAP", "papillon", "stroke"),
    SwimCode("4N", "quatre nages", "stroke"),
    SwimCode("EF", "endurance fondamentale", "pace"),
    SwimCode("EA", "endurance active", "pace"),
    SwimCode("SL", "seuil", "pace"),
    SwimCode("VMA", "vitesse maximale aérobie", "pace"),
    SwimCode("SP", "sprint", "pace"),
    SwimCode("RC", "récupération", "pace"),
    SwimCode("PB", "pull-buoy", "option"),
    SwimCode("PL", "plaquettes", "option"),
    SwimCode("PM", "palmes", "option"),
    SwimCode("PLA", "planche", "option"),
    SwimCode("TU", "tuba", "option"),
    SwimCode("JB", "jambes seules", "option"),
    SwimCode("BRS", "bras seuls", "option"),
    SwimCode("ÉD", "éducatifs", "option"),
    SwimCode("RAT", "rattrapé", "option"),
)


def normalise_code(raw: str) -> str:
    """La clé de comparaison d'un sigle : majuscules, sans accent.

    `ÉD`, `ED` et `éd` désignent le même sigle. La forme **affichée** reste celle du
    glossaire ; seule la comparaison passe par ici.
    """
    decomposed = unicodedata.normalize("NFKD", raw.strip())
    return "".join(char for char in decomposed if not unicodedata.combining(char)).upper()


#: Ce qu'un sigle ajouté ne peut pas être : `R15` ou `D1` se liraient comme une
#: récupération, et la syntaxe passe avant le glossaire.
_RESERVED = re.compile(r"^[RD]\d")
_CODE_SHAPE = re.compile(r"^[A-Z0-9]+$")


def code_problem(raw: str) -> str | None:
    """Pourquoi ce sigle ne peut pas entrer au glossaire, ou `None`.

    Les règles de **forme** seulement. L'unicité dépend du glossaire en place, et c'est
    au service de la vérifier.
    """
    key = normalise_code(raw)
    if not key:
        return "Un sigle ne peut pas être vide."
    if len(key) > MAX_CODE:
        return f"Un sigle tient en {MAX_CODE} caractères au plus."
    if not _CODE_SHAPE.match(key):
        return "Un sigle ne contient que des lettres et des chiffres."
    if key.isdigit():
        return "Un sigle ne peut pas être un nombre : il se lirait comme une distance."
    if _RESERVED.match(key):
        return (
            "Un sigle ne peut pas commencer par R ou D suivi d'un chiffre : c'est la récupération."
        )
    return None


class Glossary:
    """Les sigles en vigueur, base et ajouts confondus."""

    def __init__(self, codes: Iterable[SwimCode]) -> None:
        self._codes: dict[str, SwimCode] = {}
        for code in codes:
            self._codes[normalise_code(code.code)] = code

    @classmethod
    def base(cls) -> Glossary:
        return cls(BASE_CODES)

    def find(self, raw: str) -> SwimCode | None:
        return self._codes.get(normalise_code(raw))

    @property
    def codes(self) -> list[SwimCode]:
        return list(self._codes.values())

    def of(self, category: Category) -> list[SwimCode]:
        return [code for code in self._codes.values() if code.category == category]

    def describe(self) -> list[str]:
        """Le glossaire en lignes lisibles — pour la consigne et pour un refus."""
        return [
            f"{CATEGORY_LABELS[category]} : "
            + ", ".join(f"{code.code} ({code.label})" for code in self.of(category))
            for category in ("stroke", "pace", "option")
        ]


# ── Ce que la lecture rend ────────────────────────────


class SwimShare(BaseModel):
    """Une part de la distance — par nage, ou par allure."""

    code: str
    label: str
    distance_m: int


class SwimLine(BaseModel):
    """Une ligne lue. Le texte est **réécrit** dans la forme canonique : `×`, `'`, sigles
    tels que le glossaire les écrit. L'écran l'affiche sans rien recomposer."""

    number: int
    kind: Literal["section", "block"]
    text: str
    #: La distance que la ligne ajoute au total, répétitions déroulées. `0` pour un titre.
    distance_m: int = 0


class SwimError(BaseModel):
    """Une faute, sur une ligne précise."""

    line: int
    #: Le jeton fautif tel qu'il a été tapé, ou `null` si la ligne entière est en cause.
    token: str | None = None
    message: str


class SwimProgram(BaseModel):
    """Un programme lu (`docs/planning-natation.md` §2.3).

    Les totaux ne sont rendus **que si le programme est sans faute** : un total calculé sur
    les lignes lisibles seulement serait un chiffre faux présenté comme juste.
    """

    lines: list[SwimLine] = Field(default_factory=list)
    errors: list[SwimError] = Field(default_factory=list)
    total_m: int | None = None
    by_stroke: list[SwimShare] = Field(default_factory=list)
    by_pace: list[SwimShare] = Field(default_factory=list)
    #: Repos cumulé des seuls `R`, en secondes. Un `D` ne donne aucun repos sans connaître
    #: l'allure nagée, et l'estimer serait une valeur inventée. `null` si le programme ne
    #: porte aucun `R`.
    rest_s: int | None = None

    @property
    def valid(self) -> bool:
        return not self.errors


# ── La lecture ────────────────────────────────────────

_TIMES = re.compile(r"(\d)\s*[xX×*]\s*(?=[\d(])")
#: L'apostrophe courbe d'iOS, son pendant ouvrant, le prime et les accents aigu et grave.
#: Écrits en échappements : à l'œil, ils sont indiscernables de celle qu'ils remplacent.
_APOSTROPHES = str.maketrans(dict.fromkeys("\u2019\u2018\u2032\u00b4`", "'"))
_DISTANCE = re.compile(r"^(?:(\d+)×)?(\d+)$")
_RECOVERY = re.compile(r"^([RD])(\d+)(?:'(\d{2})?)?$")
_GROUP = re.compile(r"^(\d+)×\((.*)\)(.*)$")


def _typography(line: str) -> str:
    """Ramène la typographie du pouce à la forme canonique."""
    text = line.translate(_APOSTROPHES)
    text = _TIMES.sub(r"\1×", text)
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class _Block:
    """Un bloc lu, avant déroulement des répétitions."""

    reps: int
    distance: int
    stroke: SwimCode
    pace: SwimCode | None
    options: list[SwimCode]
    rest_s: int | None
    text: str

    @property
    def total(self) -> int:
        return self.reps * self.distance


class _NotationError(Exception):
    def __init__(self, message: str, token: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.token = token


def _recovery(token: str) -> tuple[str, int] | None:
    """`R15` → (`R`, 15) ; `R1'` → (`R`, 60) ; `D1'30` → (`D`, 90). `None` si ce n'en est
    pas une — c'est alors au glossaire de dire ce que le jeton est."""
    match = _RECOVERY.match(token.upper())
    if not match:
        return None
    letter, first, seconds = match.groups()
    has_minutes = "'" in token
    if has_minutes:
        if seconds is not None and int(seconds) >= 60:
            raise _NotationError(f"« {token} » : les secondes vont de 00 à 59.", token)
        value = int(first) * 60 + int(seconds or 0)
    else:
        value = int(first)
    if value <= 0:
        raise _NotationError(f"« {token} » : une récupération dure au moins une seconde.", token)
    if value > MAX_RECOVERY_S:
        raise _NotationError(
            f"« {token} » : au-delà de 10', ce n'est plus une récupération.", token
        )
    return letter, value


def _clock(seconds: int) -> str:
    """15 → `15` ; 60 → `1'` ; 90 → `1'30`. La forme qu'on relit au bord du bassin."""
    if seconds < 60:
        return str(seconds)
    minutes, rest = divmod(seconds, 60)
    return f"{minutes}'" if rest == 0 else f"{minutes}'{rest:02d}"


def _distance(token: str) -> tuple[int, int]:
    match = _DISTANCE.match(token)
    if not match:
        raise _NotationError(
            f"« {token} » : un bloc commence par sa distance — « 400 » ou « 8×50 ».", token
        )
    reps = int(match.group(1) or 1)
    distance = int(match.group(2))
    if not 1 <= reps <= MAX_REPS:
        raise _NotationError(f"« {token} » : de 1 à {MAX_REPS} répétitions.", token)
    if distance % POOL_STEP or not POOL_STEP <= distance <= MAX_DISTANCE:
        raise _NotationError(
            f"« {token} » : la distance est un multiple de {POOL_STEP} m, "
            f"de {POOL_STEP} à {MAX_DISTANCE}.",
            token,
        )
    return reps, distance


def _block(text: str, glossary: Glossary) -> _Block:
    tokens = text.split(" ")
    reps, distance = _distance(tokens[0])

    stroke: SwimCode | None = None
    pace: SwimCode | None = None
    options: list[SwimCode] = []
    recovery: tuple[str, int] | None = None

    for token in tokens[1:]:
        if recovery is not None:
            raise _NotationError(f"« {token} » : la récupération se place en dernier.", token)

        found = _recovery(token)
        if found is not None:
            if stroke is None:
                raise _NotationError("Il manque la nage avant la récupération.", token)
            recovery = found
            continue

        code = glossary.find(token)
        if code is None:
            raise _NotationError(f"« {token} » n'est pas dans le glossaire.", token)

        if code.category == "stroke":
            if stroke is not None:
                raise _NotationError(
                    f"« {token} » : une seule nage par bloc — {stroke.code} est déjà là.", token
                )
            stroke = code
        elif stroke is None:
            raise _NotationError(
                f"« {token} » est une {CATEGORY_LABELS[code.category]} : "
                "la nage vient d'abord (CR, DOS, BR…).",
                token,
            )
        elif code.category == "pace":
            if pace is not None:
                raise _NotationError(f"« {token} » : une seule allure par bloc.", token)
            if options:
                raise _NotationError(f"« {token} » : l'allure se place avant les options.", token)
            pace = code
        else:
            if code in options:
                raise _NotationError(f"« {token} » apparaît deux fois.", token)
            options.append(code)

    if stroke is None:
        raise _NotationError("Il manque la nage (CR, DOS, BR…).")

    rest_s = recovery[1] if recovery and recovery[0] == "R" else None
    canonical = " ".join(
        part
        for part in (
            f"{reps}×{distance}" if reps > 1 else str(distance),
            stroke.code,
            pace.code if pace else None,
            *(option.code for option in options),
            f"{recovery[0]}{_clock(recovery[1])}" if recovery else None,
        )
        if part
    )
    return _Block(reps, distance, stroke, pace, options, rest_s, canonical)


@dataclass
class _Read:
    """Ce qu'une ligne de bloc apporte aux totaux."""

    text: str
    distance: int
    blocks: list[tuple[int, _Block]]  # (multiplicateur, bloc)
    rest_s: int


def _group(match: re.Match[str], glossary: Glossary) -> _Read:
    reps = int(match.group(1))
    if not 1 <= reps <= MAX_REPS:
        raise _NotationError(f"« {reps}× » : de 1 à {MAX_REPS} répétitions.", f"{reps}×")
    inner, tail = match.group(2).strip(), match.group(3).strip()
    if "(" in inner or ")" in inner:
        raise _NotationError("Un seul niveau de parenthèses.")
    parts = [part.strip() for part in inner.split(";")]
    if not inner or any(not part for part in parts):
        raise _NotationError("Une série entre parenthèses porte des blocs séparés par « ; ».")

    blocks = [_block(part, glossary) for part in parts]

    tail_rest = 0
    tail_text = ""
    if tail:
        found = _recovery(tail)
        if found is None or " " in tail:
            raise _NotationError(f"« {tail} » : après la parenthèse, seule une récupération.", tail)
        tail_rest = found[1] if found[0] == "R" else 0
        tail_text = f" {found[0]}{_clock(found[1])}"

    rest = reps * (sum(b.reps * (b.rest_s or 0) for b in blocks) + tail_rest)
    text = f"{reps}×({' ; '.join(b.text for b in blocks)}){tail_text}"
    return _Read(
        text=text,
        distance=reps * sum(b.total for b in blocks),
        blocks=[(reps, b) for b in blocks],
        rest_s=rest,
    )


def _line(text: str, glossary: Glossary) -> _Read:
    group = _GROUP.match(text)
    if group:
        return _group(group, glossary)
    if "(" in text or ")" in text:
        raise _NotationError("Une série s'écrit « 2×(4×25 CR SP R20 ; 100 DOS RC) ».")
    block = _block(text, glossary)
    return _Read(
        text=block.text,
        distance=block.total,
        blocks=[(1, block)],
        rest_s=block.reps * (block.rest_s or 0),
    )


def _shares(totals: dict[str, int], glossary: Glossary) -> list[SwimShare]:
    shares = []
    for key, distance in sorted(totals.items(), key=lambda item: -item[1]):
        code = glossary.find(key)
        assert code is not None  # chaque clé vient d'un sigle trouvé
        shares.append(SwimShare(code=code.code, label=code.label, distance_m=distance))
    return shares


def parse(program: str, glossary: Glossary | None = None) -> SwimProgram:
    """Lit un programme. Ne lève jamais : une faute est rendue, ligne par ligne.

    Les numéros de ligne comptent les lignes **vides** aussi : c'est ce que l'utilisateur
    voit dans son champ, et « ligne 3 » doit désigner la troisième qu'il a sous les yeux.
    """
    words = glossary or Glossary.base()
    lines: list[SwimLine] = []
    errors: list[SwimError] = []
    by_stroke: dict[str, int] = {}
    by_pace: dict[str, int] = {}
    total = 0
    rest = 0
    has_rest = False

    raw_lines = program.splitlines()
    if len(program) > MAX_CHARS:
        errors.append(SwimError(line=0, message=f"{MAX_CHARS} caractères au plus."))
    if sum(1 for raw in raw_lines if raw.strip()) > MAX_LINES:
        errors.append(SwimError(line=0, message=f"{MAX_LINES} lignes au plus."))

    for number, raw in enumerate(raw_lines, start=1):
        text = _typography(raw)
        if not text:
            continue

        if text.endswith(":"):
            title = text[:-1].strip()
            if not title:
                errors.append(SwimError(line=number, message="Un titre de section est vide."))
                continue
            lines.append(SwimLine(number=number, kind="section", text=f"{title} :"))
            continue

        try:
            read = _line(text, words)
        except _NotationError as fault:
            errors.append(SwimError(line=number, token=fault.token, message=fault.message))
            continue

        lines.append(
            SwimLine(number=number, kind="block", text=read.text, distance_m=read.distance)
        )
        total += read.distance
        rest += read.rest_s
        has_rest = has_rest or any(block.rest_s for _, block in read.blocks)
        for factor, block in read.blocks:
            key = normalise_code(block.stroke.code)
            by_stroke[key] = by_stroke.get(key, 0) + factor * block.total
            if block.pace is not None:
                pace_key = normalise_code(block.pace.code)
                by_pace[pace_key] = by_pace.get(pace_key, 0) + factor * block.total

    if errors:
        return SwimProgram(lines=lines, errors=errors)

    return SwimProgram(
        lines=lines,
        errors=[],
        total_m=total if any(line.kind == "block" for line in lines) else None,
        by_stroke=_shares(by_stroke, words),
        by_pace=_shares(by_pace, words),
        rest_s=rest if has_rest else None,
    )


def uses(program: str, code: str) -> bool:
    """Le programme emploie-t-il ce sigle ? Pour refuser une suppression (§3).

    Lu jeton par jeton plutôt que par recherche de sous-chaîne : `PL` ne doit pas être
    trouvé dans `PLA`. Une ligne illisible compte quand même — un programme abîmé à la
    main reste un programme qui emploie ses sigles.
    """
    key = normalise_code(code)
    for raw in program.splitlines():
        text = _typography(raw)
        if not text or text.endswith(":"):
            continue
        for token in re.split(r"[\s();]+", text):
            if token and normalise_code(token) == key:
                return True
    return False


def describe_errors(errors: Sequence[SwimError]) -> str:
    """Les fautes en une phrase — pour un `422` et pour la relance du modèle."""
    return " ; ".join(
        f"ligne {error.line} : {error.message}" if error.line else error.message for error in errors
    )


#: Trois programmes d'exemple, montrés au modèle **tels quels**. Un gabarit abstrait laisse
#: deviner la forme ; cinq échecs d'affilée sur un `kind` décrit « texte » ont montré ce
#: que ça coûte (voir `assistant/actions.py`).
EXAMPLES: tuple[str, ...] = (
    "Échauffement :\n400 CR EF\n4×50 CR ÉD R15\nCorps :\n8×100 CR EA PB R20\n"
    "Retour au calme :\n200 DOS RC",
    "300 CR EF\n6×50 4N EA R20\n2×(4×25 CR SP R30 ; 100 DOS RC) R1'\n200 BR RC",
    "Technique :\n8×50 CR ÉD RAT R15\n4×100 CR EF PB PL D2'\n200 CR RC",
)


def guide(glossary: Glossary | None = None) -> str:
    """La notation, expliquée au modèle (`docs/planning-natation.md` §5.2).

    Rendue d'ici et non écrite dans la consigne de l'assistant : la grammaire et le
    glossaire sont ceux que `parse` applique, ajouts de l'utilisateur compris. Deux
    descriptions écrites à deux endroits finiraient par se contredire, et c'est la plus
    vieille que le modèle suivrait.
    """
    words = glossary or Glossary.base()
    codes = "\n".join(f"- {line}" for line in words.describe())
    examples = "\n\n".join(EXAMPLES)
    return f"""## La natation, et sa notation — obligatoire

Toute séance de natation que tu proposes porte un "program" écrit **dans cette notation et
dans aucune autre**. Une ligne est un titre de section terminé par « : », ou un bloc :

  [N×]distance NAGE [ALLURE] [OPTIONS…] [R<repos> | D<départ>]

- distance en mètres, multiple de {POOL_STEP}, de {POOL_STEP} à {MAX_DISTANCE} ; « 8×50 » = huit fois 50 m ;
- **une** nage, obligatoire, en premier ; **une** allure au plus ; des options ensuite ;
- R15 = 15 s de repos après chaque répétition, R1' = 1 min, R1'30 = 1 min 30 ;
  D1'30 = départ toutes les 1 min 30 ; jamais R et D sur le même bloc ; toujours en dernier ;
- une série : 2×(4×25 CR SP R30 ; 100 DOS RC) R1' — blocs séparés par « ; », un seul niveau ;
- **aucun autre mot**, aucun synonyme : « NL », « crawl », « tranquille » sont refusés ;
- dans le JSON, les lignes du programme se séparent par \\n.

Sigles admis :
{codes}

Exemples :

{examples}

Quand ta réponse parle d'une séance de natation, écris-la aussi dans cette notation.

"""


def correction(faults: Sequence[str]) -> str:
    """Ce que le modèle reçoit quand sa proposition n'était pas dans la notation."""
    listed = "\n".join(f"- {fault}" for fault in faults)
    return f"""## À corriger — ta proposition précédente

Ces séances n'étaient pas dans la notation, et ont été refusées :

{listed}

Réécris ta réponse entière, avec les mêmes séances corrigées. N'emploie que les sigles
admis ci-dessus, dans l'ordre de la grammaire.

"""


__all__ = [
    "BASE_CODES",
    "CATEGORY_LABELS",
    "EXAMPLES",
    "MAX_CHARS",
    "MAX_LINES",
    "Category",
    "Glossary",
    "SwimCode",
    "SwimError",
    "SwimLine",
    "SwimProgram",
    "SwimShare",
    "code_problem",
    "correction",
    "describe_errors",
    "guide",
    "normalise_code",
    "parse",
    "uses",
]
