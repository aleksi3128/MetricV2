"""Une course sans effort perçu, estimée depuis sa FC (`docs/charge-multisport.md` §7, M-02).

Module **pur** : des paires en entrée, un facteur et sa phrase en sortie.

## Pourquoi

La charge globale est une sRPE — effort perçu × minutes. Une course `.fit` portée à la
montre sans effort noté n'y entrait pas, pendant que la page Courses lui comptait sa charge
FC : l'accueil disait « pas encore de charge globale » à côté d'une charge 7 jours de 310.
Décision de l'utilisateur, le 28 octobre : une telle course entre par sa **charge FC
convertie**, **dite estimée**, et l'effort perçu, dès qu'il est noté, la **remplace**.

## La conversion : calibrée, jamais écrite en dur

Charge FC (`activity/load.py`, minutes par zone pondérées de 1 à 5) et sRPE (effort de 1 à
10 × minutes) n'ont pas la même unité, et leur rapport dépend de la personne : à zones
égales, l'un note 3 ce que l'autre note 5. Une constante — « × 2, puisque 5 zones font 10
points d'effort » — serait une valeur décidée ici, qu'aucune mesure n'a vue.

Le facteur est donc **appris sur les propres courses de l'utilisateur qui ont les deux** :
une charge FC et un effort perçu. Pour chacune, `sRPE ÷ charge FC` ; le facteur est la
**médiane** de ces rapports. Une médiane, et non un rapport des sommes : une sortie longue
pèserait autant que cinq footings dans une somme, et un effort mal noté déplacerait une
moyenne — il ne déplace pas une médiane de cinq.

## Le seuil : cinq paires

`MIN_PAIRS = 5`, le plancher que le dépôt tient déjà pour dire quelque chose d'une série
de sorties (`correlations.py`, cinq sorties par groupe) ; une médiane de cinq résiste à
deux valeurs aberrantes. En dessous, **pas d'estimation** : la course reste hors de la
charge globale, et la phrase dit combien de paires manquent. Un facteur tiré de deux
courses serait une constante déguisée.

Le facteur se recalcule à chaque lecture : chaque effort noté sur une course avec FC le
déplace, et avec lui **toutes** les estimations passées. C'est voulu — une estimation
figée garderait l'erreur du premier jour — et c'est ce qui fait bouger la forme d'hier.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median
from typing import Literal

from app.core.text import fr, whole

#: Paires (charge FC, effort perçu) à partir desquelles le facteur se calcule.
MIN_PAIRS = 5


@dataclass(frozen=True, slots=True)
class Pair:
    #: La charge FC de la course (`load.Session.hr_load`), strictement positive.
    hr_load: float
    #: Sa sRPE : effort perçu × minutes.
    srpe: float


@dataclass(frozen=True, slots=True)
class Calibration:
    #: La médiane des `sRPE ÷ charge FC` ; `None` sous `MIN_PAIRS`.
    factor: float | None
    pairs: int

    @property
    def written(self) -> str:
        """Le facteur à ses deux décimales, à la française : `text.fr` n'en garde qu'une, et
        « 116 × 1,6 » sous une estimation de 191 (× 1,65) ne se vérifiait plus de tête."""
        if self.factor is None:
            return ""
        return f"{self.factor:.2f}".rstrip("0").rstrip(".").replace(".", ",")

    def estimate(self, hr_load: float | None) -> float | None:
        """La sRPE estimée d'une course sans effort perçu, ou `None` — jamais un zéro."""
        if self.factor is None or hr_load is None or hr_load <= 0:
            return None
        return round(self.factor * hr_load, 1)


def calibrate(pairs: Sequence[Pair]) -> Calibration:
    usable = [item for item in pairs if item.hr_load > 0 and item.srpe > 0]
    if len(usable) < MIN_PAIRS:
        return Calibration(factor=None, pairs=len(usable))
    return Calibration(
        factor=round(median(item.srpe / item.hr_load for item in usable), 2),
        pairs=len(usable),
    )


@dataclass(frozen=True, slots=True)
class RunShare:
    """Ce qu'une course pèse dans la charge globale — la ligne de sa page."""

    #: La sRPE comptée, mesurée ou estimée ; `None` hors de la charge.
    load: float | None
    #: `rpe` (mesurée), `hr` (estimée depuis la FC), ou `None` (hors de la charge).
    source: Literal["rpe", "hr"] | None
    text: str


def _so_far(pairs: int) -> str:
    return f"{pairs} pour l'instant" if pairs else "aucune encore"


def run_share(
    rpe: int | None, minutes: float, hr_load: float | None, calibration: Calibration
) -> RunShare:
    """Une course, mesurée, estimée, en attente du facteur, ou hors de la charge."""
    if rpe is not None:
        value = round(rpe * minutes, 1)
        return RunShare(
            load=value,
            source="rpe",
            text=(
                f"Dans la charge globale : {whole(value)}, ton effort perçu {rpe} × "
                f"{fr(minutes)}\u00a0min."
            ),
        )
    estimated = calibration.estimate(hr_load)
    if estimated is not None and hr_load is not None and calibration.factor is not None:
        return RunShare(
            load=estimated,
            source="hr",
            text=(
                f"Dans la charge globale : {whole(estimated)}, estimée depuis la FC — ta "
                f"charge FC {whole(hr_load)} × {calibration.written}, la médiane de tes "
                f"{calibration.pairs} courses notées avec FC. Noter ton effort perçu la "
                "remplace."
            ),
        )
    if hr_load is not None:
        return RunShare(
            load=None,
            source=None,
            text=(
                "Pas encore dans la charge globale : sans effort perçu, elle y entrera "
                f"estimée depuis la FC à {MIN_PAIRS} courses notées avec FC — "
                f"{_so_far(calibration.pairs)}."
            ),
        )
    return RunShare(
        load=None,
        source=None,
        text="Pas dans la charge globale tant que son effort perçu n'est pas noté.",
    )
