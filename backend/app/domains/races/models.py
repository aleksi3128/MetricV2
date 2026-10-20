"""Les courses visées. `goals/races.csv`, `goals/race_decisions.csv`.

Famille *planning* : une cible, pas une mesure — toutes les colonnes ont un défaut, et une
ligne abîmée ne fait tomber aucun écran.
"""

from __future__ import annotations

from app.storage.model import CsvDate, CsvModel


class RaceRow(CsvModel):
    #: Identifiant stable : une réponse à un conflit s'y rattache.
    race_id: str = ""
    name: str = ""
    date: CsvDate = None
    distance: str = "10k"
    priority: str = "B"
    #: Le chrono visé, `H:MM:SS` — facultatif.
    target: str = ""
    note: str = ""


class DecisionRow(CsvModel):
    #: La clé du conflit : `race_a|race_b`.
    key: str = ""
    #: `accepted` ou `refused`.
    decision: str = ""
    date: CsvDate = None
