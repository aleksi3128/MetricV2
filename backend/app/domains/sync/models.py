"""Ce que la synchro retient. `sync/imported.csv`, `sync/state.csv`.

Famille *planning* : un état, pas une mesure. `imported.csv` est ce qui rend une passe
**rejouable** : une activité déjà vue n'est pas retéléchargée, même ignorée.
"""

from __future__ import annotations

from app.storage.model import CsvDate, CsvModel


class ImportedRow(CsvModel):
    garmin_id: str = ""
    #: `run`, `swim`, `other`, ou `ignored` (un sport que Metric ne compte pas).
    kind: str = ""
    #: L'identifiant stable de la séance créée — vide si elle existait déjà.
    local_id: str = ""
    date: CsvDate = None


class StateRow(CsvModel):
    key: str = ""
    value: str = ""
