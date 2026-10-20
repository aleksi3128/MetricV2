"""Modèle CSV du planning sport.

`planning/plan.csv` : id, date, time, kind, title, duration_min, note, source, program

`planning/swim_codes.csv` : id, code, label, category, source — le glossaire de nage, ou
plutôt **ce qui s'écarte** de celui que livre `swim.py` (`docs/planning-natation.md` §3).

**Ce fichier décrit ce qui est prévu, pas ce qui a eu lieu.** Il appartient donc à la
famille *planning* du §2 de `docs/etat-du-projet.md`, avec `settings.csv`, les trois
fichiers de pistes et `supplements/schedule.csv` — et non à la famille *mesure*, qui
refuse une ligne illisible.

La conséquence tient en une phrase : **toutes les colonnes portent un défaut**, y compris
`date`. C'est ce qui rend `STO-04` vrai ici, et ce n'est pas une précaution théorique —
une cellule `time` vide de `supplements/schedule.csv` a fait tomber le tableau de bord
entier en `502` au premier usage réel. La colonne `time` de ce fichier-ci est
**facultative par conception** (`PLAN-02` : « heure optionnelle ») : elle sera vide bien
plus souvent qu'elle ne l'a été là-bas, et une séance sans horaire est un cas normal, pas
une ligne abîmée.

Une ligne sans identifiant ou sans date est écartée des vues — on ne sait pas quel jour
l'afficher ni quelle ligne modifier — mais elle **survit dans le fichier** : on n'efface
pas ce qu'on ne comprend pas.
"""

from __future__ import annotations

from app.storage.model import CsvDate, CsvDateTime, CsvModel, CsvNumber

#: Natures de séance planifiables (`PLAN-02`). Contrairement au `type` d'une séance
#: réalisée, qui reste libre (`ACT-03`), celle-ci est **fermée** : elle sert à comparer
#: un plan à un réalisé et à colorer un calendrier. Le titre porte le détail — « muscu » +
#: « Haut du corps » dit tout ce qu'il faut.
#:
#: `natation` est la quatrième, et la seule qui porte un **programme** : la notation lue par
#: `swim.py`. Une ligne écrite `natation` à la main avant qu'elle existe était ramenée à
#: `autre` ; elle redevient ce qu'elle disait.
KINDS: tuple[str, ...] = ("course", "muscu", "natation", "autre")

#: Repli d'une nature illisible. Une valeur mal orthographiée dans un tableur donne une
#: séance « autre » plutôt qu'une ligne perdue.
DEFAULT_KIND = "autre"


def normalise_kind(raw: str) -> str:
    """Ramène une cellule `kind` à l'une des natures connues."""
    cleaned = raw.strip().lower()
    return cleaned if cleaned in KINDS else DEFAULT_KIND


class PlanRow(CsvModel):
    """Une séance prévue. `planning/plan.csv`."""

    #: Identifiant stable, et non la position : le flux iCal en fait son `UID`, et un
    #: `UID` qui change à chaque suppression de ligne ferait réapparaître les séances en
    #: double dans un calendrier abonné.
    id: str = ""
    date: CsvDate = None
    #: `HH:MM`, **facultatif**. Vide, la séance est prévue sans heure : elle s'affiche en
    #: tête de journée et sort en évènement « toute la journée » dans le flux iCal.
    time: str = ""
    #: `course`, `muscu` ou `autre` — voir `KINDS`.
    kind: str = DEFAULT_KIND
    title: str = ""
    #: Durée prévue en minutes. `0` signifie « non renseignée », ce que seule une édition
    #: à la main peut produire : la saisie, elle, l'exige.
    duration_min: CsvNumber = 0
    note: str = ""
    #: `manual` ou `ai` (`PLAN-04`). Ce que la colonne raconte, c'est d'où vient la ligne.
    source: str = "manual"
    #: Le programme d'une séance de natation, dans la notation de `swim.py`, une ligne par
    #: bloc. Vide partout ailleurs, et vide aussi pour une « piscine libre ».
    #:
    #: Une colonne et non la note : la note porte déjà le lien Cadence, et deux contenus
    #: dans une même cellule, ce sont deux règles d'extraction qui finissent par se gêner.
    #: Ajoutée en dernier, avec un défaut : les lignes écrites avant se relisent telles
    #: quelles.
    program: str = ""


#: Catégories d'un sigle, telles que le fichier les écrit.
SWIM_CATEGORIES: tuple[str, ...] = ("stroke", "pace", "option")


class SwimCodeRow(CsvModel):
    """Un sigle ajouté, ou le libellé renommé d'un sigle de base. `planning/swim_codes.csv`.

    Famille *planning* : toutes les colonnes ont un défaut. Une ligne sans code est ignorée
    à la lecture et survit dans le fichier.
    """

    id: str = ""
    code: str = ""
    label: str = ""
    #: `stroke`, `pace` ou `option`. **Ignorée** sur un sigle de base : sa catégorie est
    #: celle du code, qu'aucune ligne ne déplace.
    category: str = "option"
    source: str = "manual"


class ChangeRow(CsvModel):
    """Une modification du coach au planning. `planning/changes.csv`.

    `before` et `after` portent la séance en JSON — date, heure, nature, titre, durée,
    note. `before` est ce qui permet le « non » : il restaure la séance telle qu'elle était,
    et seulement si elle est encore telle que le coach l'a laissée (`after`).
    """

    key: str = ""
    session_id: str = ""
    #: `move`, `lighten`, `rest` ou `drop`.
    action: str = ""
    before: str = ""
    after: str = ""
    reason: str = ""
    created: CsvDateTime = None
    #: `pending`, `accepted` ou `refused`.
    status: str = "pending"
