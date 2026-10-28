"""Le jeu d'évaluation se charge, et ne promet rien que l'application ne sache faire.

`make eval` appelle un modèle payant, et ne se lance donc jamais dans la batterie. Ses cas,
eux, sont du code : un nom d'action renommé, une tranche disparue ou une vérification qui
lève se découvriraient au premier `make eval` — c'est-à-dire en payant pour l'apprendre.
Ce fichier les relit **sans appeler aucun modèle** : il n'importe ni le client ni le
lanceur, et ne joue aucune réponse.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.domains.assistant import context
from app.domains.assistant.actions import catalogue
from evals import CAS
from evals.checks import Reponse
from evals.fixtures import TRANCHES

CASES = Path(__file__).parents[1] / "evals" / "cases.py"


def test_every_case_has_its_own_name() -> None:
    names = [cas.nom for cas in CAS]
    assert len(names) == len(set(names))


def test_the_actions_named_by_the_cases_exist() -> None:
    """Un nom faux ne ferait pas échouer `make eval` : il le ferait **mentir**, chaque
    réponse juste étant comptée fausse sous un nom que le catalogue n'a pas."""
    named = set(re.findall(r'action_(?:demandee|avec)\("([a-z.]+)"', CASES.read_text()))

    assert named, "aucune action nommée : l'expression ne lit plus le fichier"
    assert named <= set(catalogue()), named - set(catalogue())


#: Trois tranches que le jeu sert encore et que l'application n'a plus.
#:
#: Trouvées par ce fichier le 28 octobre 2026 (M-10) : `charge-lundi` les réclame depuis
#: le lot 1, et la refonte de l'activité (tout par Cadence) les a retirées de
#: `context.SLICES`. Le cas mesure donc une seconde passe que la production ne ferait plus.
#: Le reprendre est une décision sur ce cas, pas un correctif en passant — elle est notée
#: au §7 de `docs/pages/modifications.md`. La liste ne peut que rétrécir.
GONE = {"progression_charges", "detail_seances", "exercices"}


def test_the_slices_a_case_serves_exist_both_frozen_and_live() -> None:
    gone: set[str] = set()
    for cas in CAS:
        for name in cas.tranches:
            assert name in TRANCHES, (cas.nom, name)
            if name not in context.SLICES:
                gone.add(name)

    assert gone <= GONE, gone - GONE


def test_every_check_runs_offline_on_an_empty_answer() -> None:
    """Chaque vérification rend un verdict sans réseau — sur une réponse vide, au moins."""
    empty = Reponse(reply="", remember=[], actions=[], need=[], titre="", condense=[])

    for cas in CAS:
        for check in cas.attendus:
            assert isinstance(check(empty).ok, bool), cas.nom
