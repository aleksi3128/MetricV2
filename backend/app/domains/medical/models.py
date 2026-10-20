"""Le dossier médical. `medical/entries.csv`.

**Seuls l'identifiant et la date d'écriture sont en clair.** Tout le reste — la nature,
la date, le titre, les détails, le praticien — est dans `sealed`, scellé en AES-GCM : « une
opération, en mars 2024 » est déjà une donnée médicale (D4). Le fichier ne se lit plus dans
un tableur, et c'est voulu.
"""

from __future__ import annotations

from app.storage.model import CsvDate, CsvModel


class MedicalRow(CsvModel):
    entry_id: str = ""
    sealed: str = ""
    #: Le jour d'écriture, pour ordonner — pas la date de l'événement, qui est scellée.
    created: CsvDate = None
