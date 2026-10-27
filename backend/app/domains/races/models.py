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
    #: La date de course pour laquelle le plan **posé** au planning a été calculé — vide
    #: si le plan de cette course n'est pas posé (M-17). Différente de `date`, elle dit que
    #: le plan posé ne suit plus sa course : c'est le serveur qui le sait, pas l'écran.
    #: Ajoutée en dernier, avec un défaut : les lignes écrites avant se relisent telles
    #: quelles.
    plan_date: CsvDate = None


class DecisionRow(CsvModel):
    #: La clé du conflit : `race_a|race_b`.
    key: str = ""
    #: `accepted` ou `refused`.
    decision: str = ""
    date: CsvDate = None
