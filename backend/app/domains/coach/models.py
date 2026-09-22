"""Les propositions du coach. `coach/recommendations.csv` (`docs/coach-course.md` §7).

**Une active à la fois, l'historique gardé.** Comparer la séance proposée à la sortie
faite est la seule façon de savoir, dans trois mois, si le coach vaut quelque chose — et
cela suppose de ne jamais écraser une proposition : elle change de statut.

Les étapes ne sont **pas** rangées. Elles se rebâtissent depuis le type, la durée et les
répétitions, contre les références du jour (`catalog.steps`) : une FC max mesurée entre-temps
corrige les cibles d'une séance déjà proposée, ce qu'une cible figée dans le fichier ne
ferait pas.
"""

from __future__ import annotations

from app.storage.model import CsvDate, CsvDateTime, CsvModel


class RecommendationRow(CsvModel):
    #: Identifiant **stable** : l'acceptation, le fichier de la montre et l'historique s'y
    #: rattachent, pas à la position.
    id: str = ""
    created: CsvDateTime = None
    #: La sortie dont l'import a déclenché la proposition — vide pour une proposition
    #: redemandée à la main.
    run_id: str = ""
    date: CsvDate = None
    time: str = ""
    type: str = "easy"
    duration_min: int = 0
    reps: int | None = None
    rep_min: float | None = None
    #: L'explication — du modèle quand `source` vaut `model`, des règles sinon.
    rationale: str = ""
    source: str = "rules"
    #: `proposed`, `accepted`, `refused`, `done`, `replaced`.
    status: str = "proposed"
    plan_session_id: str = ""
    #: Les phrases du cadre, jointes par « | » : ce qui bornait le choix ce jour-là.
    frame: str = ""
