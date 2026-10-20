"""L'état d'un soir. `routine/evening.csv`.

Famille *planning*, comme `morning_flow.csv` : un état, pas une mesure. Il ne dit que ce
que les données ne savent pas — que le point a eu lieu (`done`), ou qu'on a demandé à être
rappelé plus tard (`snoozed_until`).
"""

from __future__ import annotations

from app.storage.model import CsvDate, CsvDateTime, CsvModel


class EveningRow(CsvModel):
    date: CsvDate = None
    #: « C'est noté » : les relances s'arrêtent pour ce soir.
    done: bool = False
    #: « Rappelle-moi dans 30 min » : silence jusqu'à cet instant, puis reprise.
    snoozed_until: CsvDateTime = None
