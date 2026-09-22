"""L'état du parcours d'un matin. `routine/morning_flow.csv`.

**Ce fichier ne dit que ce que les données ne savent pas.** Une étape de saisie est faite
quand sa donnée existe — une FC de repos du jour, une pesée du jour —, pas quand on l'a
vue : se peser à 7 h puis ouvrir l'app à 10 h reprend donc à l'étape suivante sans rien
redemander. Restent deux choses que rien d'autre ne porte : les étapes **passées** (lues,
ou sautées d'un « Passer »), et « Pas ce matin ».

Famille *planning* du §2 d'`etat-du-projet.md` : un état, pas une mesure — toutes les
colonnes ont un défaut, et une ligne abîmée ne fait tomber aucun écran.
"""

from __future__ import annotations

from app.storage.model import CsvDate, CsvModel


class MorningFlowRow(CsvModel):
    date: CsvDate = None
    #: Les étapes passées, séparées par des espaces : `session day`.
    passed: str = ""
    #: « Pas ce matin » : le parcours se tait jusqu'au lendemain.
    snoozed: bool = False
