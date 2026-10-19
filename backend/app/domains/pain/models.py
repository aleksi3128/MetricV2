"""Les relevés de douleur. `body/pain.csv` (`docs/douleurs.md` §2).

Famille *mesure* : une ligne sans date ne se relit pas. Toutes les autres colonnes portent
un défaut, parce qu'une colonne ajoutée plus tard ne doit pas invalider les lignes d'avant
(`STO-04`).

**Une ligne par relevé.** Un épisode — une douleur, de son ouverture à son retour à la
base — regroupe le relevé qui l'ouvre et ses suivis par `pain_id`, identifiant **stable**
au même titre que `run_id` : la position d'une ligne se décale à la première suppression,
et un suivi rattaché par position changerait d'épisode sans que rien ne le dise.
"""

from __future__ import annotations

from datetime import date

from app.storage.model import CsvModel

#: Un relevé de douleur, ou « pas de douleur » déclaré pour une sortie. Le second n'ouvre
#: aucun épisode ; il dit que la question a été posée et qu'on y a répondu non, ce que
#: l'absence de ligne ne dit pas — et c'est sur cette différence que les patterns (R4)
#: compareront les sorties avec et sans douleur.
REPORTS: tuple[str, ...] = ("pain", "none")
SIDES: tuple[str, ...] = ("left", "right", "both", "na")
MOMENTS: tuple[str, ...] = ("during", "after", "next_day", "rest")
#: `sharp` est « vive » : un signe qualifiant, qui arrête la course à toute intensité.
KINDS: tuple[str, ...] = ("dull", "sharp", "pulling", "burning", "stiff", "other")
SOURCES: tuple[str, ...] = ("import", "morning", "manual")


class PainRow(CsvModel):
    pain_id: str = ""
    date: date
    report: str = "pain"
    zone: str = ""
    side: str = "na"
    intensity: int = 0
    #: Le niveau d'avant la séance, demandé à l'ouverture seulement. Vide sur un suivi :
    #: la base est celle de l'épisode, pas une valeur recopiée à chaque ligne.
    baseline: int | None = None
    moment: str = "after"
    kind: str = "other"
    limp: bool = False
    #: La sortie liée, par son identifiant stable — vide pour une douleur hors course.
    run_id: str = ""
    note: str = ""
    source: str = "manual"
