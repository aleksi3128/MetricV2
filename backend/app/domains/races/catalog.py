"""Ce qu'une distance demande (`docs/plan-course.md` §3).

Des valeurs de départ pour un coureur qui construit son volume, et non des normes : elles
sont citées de la littérature d'entraînement courante et **à vérifier**, comme le cahier
le demande de tous ses seuils. Chacune est une constante nommée, modifiable par un commit.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Distance = Literal["5k", "10k", "semi", "marathon", "sprint", "olympique", "70.3", "ironman"]


@dataclass(frozen=True)
class Spec:
    label: str
    #: La part course, en kilomètres — ce que la course dure à pied.
    run_km: float
    #: Le triathlon : sa part course seule est planifiée dans ce lot (D8).
    triathlon: bool
    #: Le pic de volume hebdomadaire visé, en course à pied.
    peak_km: float
    #: La plus longue sortie visée au pic.
    long_km: float
    #: Les jours d'affûtage avant la course (Bosquet 2007 : environ deux semaines, adapté).
    taper_days: int
    #: Les semaines de préparation en dessous desquelles le plan avertit.
    min_weeks: int
    #: Les semaines qui doivent séparer cet objectif A d'un autre (préparation et
    #: récupération) — c'est la règle des conflits.
    spacing_weeks: int
    #: L'exigence, pour trancher un conflit : la plus haute reste A.
    weight: int
    #: Le sigle de l'allure spécifique dans la notation (D6).
    pace_code: str


SPECS: dict[str, Spec] = {
    "5k": Spec("5 km", 5, False, 30, 10, 7, 6, 3, 1, "AS5"),
    "10k": Spec("10 km", 10, False, 40, 14, 10, 8, 4, 3, "AS10"),
    "semi": Spec("Semi-marathon", 21.1, False, 50, 18, 14, 10, 6, 5, "ASS"),
    "marathon": Spec("Marathon", 42.2, False, 65, 30, 21, 16, 12, 7, "ASM"),
    "sprint": Spec("Triathlon sprint", 5, True, 25, 10, 7, 6, 4, 2, "AS5"),
    "olympique": Spec("Triathlon olympique", 10, True, 30, 14, 10, 10, 6, 4, "AS10"),
    "70.3": Spec("Half Ironman (70.3)", 21.1, True, 40, 18, 14, 16, 12, 6, "ASS"),
    "ironman": Spec("Ironman", 42.2, True, 50, 28, 21, 24, 16, 8, "ASM"),
}
