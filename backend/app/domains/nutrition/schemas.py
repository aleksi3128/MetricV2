"""Formes échangées pour la nutrition (`NUT-01` → `NUT-10`)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.validation import (
    Calories,
    FiberG,
    Label,
    Note,
    PastDateTime,
    Per100Calories,
    Per100G,
    ProteinG,
    QuantityG,
    SaturatedFatG,
    SugarG,
)


class MealPayload(BaseModel):
    """Correction d'un repas (`NUT-05`, `NUT-09`).

    La création passe par un formulaire multipart — un fichier ne se transporte pas en
    JSON — et ses champs sont déclarés directement sur l'endpoint.
    """

    meal_type: Label
    comment: Note | None = None
    protein_g: ProteinG | None = None
    added_sugar_g: SugarG | None = None
    calories: Calories | None = None
    #: Acides gras saturés et fibres (`NUT-16`), **préservés quand ils sont absents**.
    #:
    #: Le reste de ce schéma remplace : un champ absent vaut `null`, et `null` efface.
    #: Ces deux-là sont venus après, et tout appelant écrit avant eux — un onglet resté
    #: sur l'ancienne version, l'estimation acceptée depuis la ligne du journal —
    #: effacerait des fibres dont il ignore l'existence. Ils suivent donc la règle de
    #: `source` : absents, la valeur rangée reste ; présents, même à `null`, ils
    #: s'appliquent. Le service lit la différence dans `model_fields_set`.
    saturated_fat_g: SaturatedFatG | None = None
    fiber_g: FiberG | None = None
    datetime: PastDateTime | None = None
    #: Provenance, **seulement quand elle change** (`NUT-04`).
    #:
    #: Absente — le cas de toute correction ordinaire — la provenance d'origine est
    #: préservée : corriger une macro estimée ne la transforme pas en saisie manuelle
    #: (`NUT-09`). Présente, elle dit un changement réel : un repas relevé à la main dont
    #: on accepte ensuite une estimation devient `ai`, et le fichier le raconte.
    source: Literal["manual", "ai"] | None = None

    @model_validator(mode="after")
    def require_content(self) -> MealPayload:
        """Un repas sans commentaire ni macro ne relève rien.

        À la correction, la photo d'origine est préservée : elle suffit donc à donner
        du contenu au repas. Le contrôle porte ici sur ce que la requête apporte.
        """
        return self


class Meal(BaseModel):
    id: int
    token: str
    datetime: datetime
    meal_type: str
    comment: str | None = None
    #: Chemin relatif, à passer à `/api/nutrition/photos/{chemin}`.
    photo: str | None = None
    protein_g: float | None = None
    added_sugar_g: float | None = None
    calories: int | None = None
    saturated_fat_g: float | None = None
    fiber_g: float | None = None
    source: str


class DayTotals(BaseModel):
    """Totaux du jour (`NUT-06`)."""

    protein_g: float
    protein_target_g: float
    #: Ce qu'il reste à prendre pour atteindre la cible, **plancher à zéro**.
    #:
    #: Même raison que `HydrationStats.remaining_ml` : la soustraction se fait ici, une
    #: fois, par le service qui détient la cible — pas dans chaque écran ni dans chaque
    #: réponse de l'assistant.
    protein_remaining_g: float = Field(ge=0)
    #: Rapport à l'objectif, plafonné pour l'affichage.
    protein_ratio: float = Field(ge=0, le=1)
    added_sugar_g: float
    added_sugar_max_g: float
    #: Vrai quand le plafond de sucres est dépassé — un signal, pas une réussite.
    over_sugar: bool
    calories: int
    #: Objectif quotidien de calories, réglable (`docs/nutrition-historique.md`).
    #:
    #: Les calories étaient relevées depuis le début et n'avaient aucune référence :
    #: « 2 340 kcal » ne veut rien dire tant qu'on ne sait pas contre quoi le lire.
    calories_target: float
    #: Rapport à l'objectif, plafonné pour l'affichage, comme celui des protéines.
    calories_ratio: float = Field(ge=0, le=1)
    #: Nombre de repas dont les calories sont renseignées, sur le total du jour.
    calories_known: int
    #: Sommes des acides gras saturés et des fibres (`NUT-16`), **avec leur couverture**.
    #:
    #: La couverture n'est pas un détail : tous les repas d'avant `NUT-16` n'ont ni l'une
    #: ni l'autre, et une somme sur des cellules vides dirait « 0 g de fibres » un jour de
    #: lentilles. Sans repas qui les porte, l'écran affiche un tiret.
    saturated_fat_g: float
    saturated_fat_known: int
    fiber_g: float
    fiber_known: int
    meals: int


class Favorite(BaseModel):
    id: int
    token: str
    favorite_id: str
    name: str
    protein_g: float | None = None
    added_sugar_g: float | None = None
    calories: int | None = None
    saturated_fat_g: float | None = None
    fiber_g: float | None = None


class FavoritePayload(BaseModel):
    name: Label
    protein_g: ProteinG | None = None
    added_sugar_g: SugarG | None = None
    calories: Calories | None = None
    saturated_fat_g: SaturatedFatG | None = None
    fiber_g: FiberG | None = None


class MealEstimate(BaseModel):
    """Ce qu'un modèle propose pour une assiette (`NUT-04`).

    **Une proposition, pas une mesure.** Tous les champs sont facultatifs : un modèle qui
    ne distingue pas les sucres ajoutés rend `null`, et l'écran laisse le champ vide. Ils
    portent les mêmes bornes qu'une saisie humaine — ce qui les dépasse a été écarté à la
    relecture, pas ramené à la borne.
    """

    comment: str | None = None
    protein_g: ProteinG | None = None
    added_sugar_g: SugarG | None = None
    calories: Calories | None = None
    saturated_fat_g: SaturatedFatG | None = None
    fiber_g: FiberG | None = None
    #: Faux quand le modèle annonce lui-même ne pas voir de nourriture.
    readable: bool = True
    #: Vrai quand la réponse ne porte **aucun** chiffre : l'écran le dit plutôt que
    #: d'afficher des champs vides sans explication.
    empty: bool = False


class NutritionView(BaseModel):
    """Tout l'écran nutrition en une requête."""

    date: date
    totals: DayTotals
    meals: list[Meal]
    favorites: list[Favorite]
    #: Type présélectionné selon l'heure courante (`NUT-03`), calculé par le serveur pour
    #: que le client ne redéfinisse pas la règle.
    suggested_type: str
    types: list[str]
    #: Catalogue d'ingrédients, pour la saisie assistée d'un repas composé (`NUT-12`).
    #:
    #: Servi avec le reste plutôt que par une requête à l'ouverture de la feuille :
    #: l'écran tient déjà en un appel, et une liste de noms courts ne pèse rien à côté du
    #: journal du jour.
    ingredients: list[Ingredient] = Field(default_factory=list)


# ── Historique (`NUT-11`) ─────────────────────────────


class HistoryDay(BaseModel):
    """Une cellule de la grille.

    Le vocabulaire d'état est celui de la grille d'assiduité (`HEAT-05`) parce que c'est
    le composant qui la peint qui le définit — mais la nutrition n'en émet que deux mots
    sur quatre. Ni `missed` ni `bonus` : voir `history.py`.
    """

    date: date
    calories: int
    protein_g: float
    added_sugar_g: float
    meals: int
    #: Repas du jour dont les calories sont renseignées. Zéro avec `meals > 0` est un
    #: état à part entière — relevé, non chiffré — et non un jour à jeun.
    calories_known: int
    #: `done` quand le jour est chiffré, `off` sinon. Jamais `missed`, jamais `bonus`.
    state: str
    #: 1 à 4 sur un jour chiffré, 0 sinon. Le quart de la plage où tombe la journée,
    #: découpé par `level_bounds` — plus foncé veut dire plus mangé que d'habitude.
    level: int
    #: `before_track` · `future` · `unmeasured`, ou `null` quand la cellule n'a rien de
    #: plus à dire qu'un jour sans repas consigné.
    reason: str | None = None


class HistoryPoint(BaseModel):
    """Un point de la courbe : un jour, ou une semaine sur la plage annuelle."""

    date: date
    calories: int
    #: Moyenne glissante sur sept jours calendaires. `null` sur une série hebdomadaire,
    #: qui est déjà une moyenne — la lisser deux fois lui ferait dire autre chose.
    trend_calories: float | None = None
    protein_g: float
    #: Moyenne glissante des protéines, même fenêtre que celle des calories. `null` sur
    #: une série hebdomadaire, pour la même raison.
    trend_protein_g: float | None = None
    added_sugar_g: float
    #: Jours chiffrés que le point résume. Toujours 1 au jour.
    days: int


class HistoryStats(BaseModel):
    """Les chiffres de la plage. Aucun n'est recalculable côté client sans redéfinir une
    règle que ce module détient déjà."""

    target_calories: float
    #: Jours de la plage déjà passés, hors de ce qui précède le premier repas consigné.
    days: int
    #: Jours portant au moins un repas.
    logged_days: int
    #: Jours portant au moins une calorie renseignée.
    measured_days: int
    #: `null` sans aucun jour chiffré : un zéro se lirait comme une journée à jeun.
    avg_calories: int | None = None
    avg_protein_g: float | None = None
    avg_added_sugar_g: float | None = None
    #: Jours chiffrés à moins de 10 % de l'objectif, au-dessus comme en dessous.
    on_target_days: int
    #: Écart de la moyenne à l'objectif, en kcal par jour — négatif en dessous. `null`
    #: sans jour chiffré, ou sans objectif à quoi se comparer.
    gap_to_target: int | None = None
    over_sugar_days: int


class WeekdayProfile(BaseModel):
    """Moyenne d'un jour de la semaine. Sept entrées sont toujours servies."""

    #: 0 = lundi, comme `date.weekday()`.
    weekday: int
    avg_calories: int | None = None
    days: int
    #: Part de la barre, rapportée à l'**objectif** et plafonnée à 1. Servie plutôt que
    #: déduite : `Bars` attend un rapport, et le calculer à l'écran serait une division
    #: de plus hors du serveur. Une barre pleine vaut donc l'objectif, ce qu'aucune
    #: référence au jour le plus copieux ne permettait de dire.
    ratio: float = 0.0
    #: Vrai quand la moyenne du jour dépasse l'objectif. Un ton, pas un jugement.
    over_target: bool = False


class TypeShare(BaseModel):
    """Part d'un type de repas dans les calories de la plage."""

    meal_type: str
    calories: int
    #: 0 à 1. Calculée ici : le client formate un pourcentage, il ne divise pas.
    share: float
    meals: int


class NutritionHistory(BaseModel):
    """Toute la section historique en une requête (`NUT-11`).

    `from` est un mot réservé de Python : le champ s'appelle `from_` dans le code et
    `from` dans le JSON, comme la plage des grilles d'assiduité.
    """

    model_config = ConfigDict(populate_by_name=True)

    range: str
    from_: date = Field(alias="from")
    to: date
    #: Le jour courant, servi plutôt que déduit : un écran ne date jamais rien lui-même.
    today: date
    #: `day` ou `week` — la courbe change de pas sur la plage annuelle.
    granularity: str
    target_calories: float
    #: L'objectif de protéines du jour, servi aussi pour la plage : la courbe des
    #: protéines se lit contre la même référence que l'anneau du jour.
    protein_target_g: float
    added_sugar_max_g: float
    #: Les trois seuils de calories qui séparent les quatre teintes de la grille, en
    #: ordre croissant. Vide quand la plage porte moins de deux jours chiffrés — il n'y a
    #: alors pas de distribution à découper. Servis pour que la légende puisse dire
    #: *moins que quoi* : « moins → plus » seul ne nommait aucune quantité.
    level_bounds: list[float] = Field(default_factory=list)
    days: list[HistoryDay]
    series: list[HistoryPoint]
    stats: HistoryStats
    weekdays: list[WeekdayProfile]
    types: list[TypeShare]


# ── Repas composé (`NUT-12`) ──────────────────────────


class IngredientLine(BaseModel):
    """Un ingrédient pesé : ses valeurs pour 100 g, et ce qu'on en a mis.

    Les valeurs pour 100 g voyagent avec la ligne plutôt que d'être relues au catalogue.
    Deux raisons : on compose souvent avec un aliment qu'on n'a jamais noté — l'obliger à
    exister d'abord ferait deux gestes là où il en faut un —, et une marque change de
    recette sans changer de nom. Ce qui compte, c'est ce qui était écrit sur l'emballage
    ce jour-là.
    """

    name: Label
    quantity_g: QuantityG
    calories_100g: Per100Calories | None = None
    protein_100g: Per100G | None = None
    added_sugar_100g: Per100G | None = None
    saturated_fat_100g: Per100G | None = None
    fiber_100g: Per100G | None = None
    #: Le code du produit scanné, quand la ligne en vient (`NUT-20`). Il ne change rien au
    #: calcul : il suit la ligne jusqu'au catalogue, pour qu'une entrée arrivée par un scan
    #: puisse plus tard être relue chez Open Food Facts.
    barcode: str = Field(default="", max_length=14)


class ComposedLine(BaseModel):
    """Ce qu'une ligne apporte réellement au plat, quantité appliquée."""

    name: str
    quantity_g: float
    calories: int
    protein_g: float
    added_sugar_g: float
    saturated_fat_g: float
    fiber_g: float


class Composition(BaseModel):
    """Le total d'un plat et le détail de ses lignes (`NUT-12`).

    **Calculé par le serveur, et c'est le sujet.** « 350 kcal pour 100 g, j'en ai mis
    180 g » est une multiplication ; la faire à l'écran la mettrait hors de portée des
    tests du domaine et en donnerait une seconde définition le jour où l'assistant devrait
    composer un repas lui aussi.
    """

    lines: list[ComposedLine]
    calories: int
    protein_g: float
    added_sugar_g: float
    saturated_fat_g: float
    fiber_g: float
    #: Vrai quand **aucune** ligne ne porte de valeur : il n'y a alors rien à totaliser,
    #: et un total à zéro se lirait comme un plat sans calories.
    empty: bool = False


class ComposePayload(BaseModel):
    """Demande de calcul. **N'écrit rien** (`NUT-12`)."""

    lines: list[IngredientLine] = Field(min_length=1, max_length=40)


class ComposedMealPayload(ComposePayload):
    """Enregistrement d'un repas composé : le calcul, puis la ligne du journal."""

    meal_type: Label
    #: Le nom du plat. Il devient le commentaire du repas — un repas composé sans titre
    #: se retrouverait au journal sans rien pour le reconnaître.
    comment: Label


class Product(BaseModel):
    """Un produit lu chez Open Food Facts, traduit en ingrédient (`NUT-13`).

    **Ce n'est pas une proposition.** Le vocabulaire de la proposition — `AiBlock`, l'état
    `proposed` d'un pas-à-pas — est réservé à ce qu'un modèle rend. Ici, c'est la lecture
    d'une base de données : même statut que le rappel d'un ingrédient du catalogue, qui
    remplit déjà les champs en clair et sans marque.

    Les cinq valeurs sont indépendamment nulles, et ce n'est pas une facilité de typage :
    la base est collaborative, un produit peut n'avoir que ses calories.
    """

    barcode: str
    name: str
    #: Pour reconnaître le produit à l'écran. N'est jamais enregistrée.
    brand: str | None = None
    calories_100g: float | None = None
    protein_100g: float | None = None
    added_sugar_100g: float | None = None
    saturated_fat_100g: float | None = None
    fiber_100g: float | None = None
    #: Vrai quand **aucune** des cinq valeurs n'est connue. La ligne s'ajoute quand même
    #: — elle dit ce qu'il y avait dans l'assiette — mais l'écran annonce qu'il n'y a rien
    #: à totaliser dessus, plutôt que d'afficher trois zéros.
    partial: bool = False


class Ingredient(BaseModel):
    """Une entrée du catalogue, telle qu'elle revient au client."""

    id: int
    token: str
    ingredient_id: str
    name: str
    calories_100g: float | None = None
    protein_100g: float | None = None
    added_sugar_100g: float | None = None
    saturated_fat_100g: float | None = None
    fiber_100g: float | None = None
    #: La portion habituelle, en grammes (`NUT-21`). Sert une **puce** sous le champ de
    #: poids, jamais un préremplissage : un poids inscrit sans qu'on l'ait pesé serait une
    #: valeur inventée à l'écran.
    portion_g: float | None = None
    barcode: str = ""
    #: Le jour d'une correction à la main (`NUT-20`). Non nul, il dit que les valeurs ne
    #: seront plus écrasées par un scan — et c'est ce que la fiche affiche.
    edited_on: date | None = None


# ── Catalogue alimentaire (`NUT-18` → `NUT-21`) ───────

#: Les plages du catalogue, **calendaires** et non glissantes.
#:
#: Choix assumé, avec sa conséquence : un 1er du mois affiche presque rien. C'est la
#: cohérence avec la grille de `NUT-11`, qui compte déjà en semaines alignées sur le
#: lundi, qui l'a emporté sur le confort d'une fenêtre qui ne retombe jamais à zéro.
CatalogRange = Literal["day", "week", "month", "quarter"]

#: Les quatre plages, dans l'ordre où la fiche les montre. Nommées une fois : une seconde
#: liste ailleurs se décollerait de celle-ci au premier ajout.
RANGE_KEYS: tuple[CatalogRange, ...] = ("day", "week", "month", "quarter")


class CatalogEntry(BaseModel):
    """Une ligne de la page catalogue : l'aliment, et ce qu'on en a mangé sur la plage.

    `times` et `quantity_g` sont à **zéro** quand l'aliment n'a pas été consigné sur la
    plage, et l'écran doit y dessiner un tiret. Ce n'est pas une contradiction avec « aucune
    valeur inventée » : `last_on` à `null` dit que l'aliment n'a jamais été pesé, et le
    zéro d'un compteur d'occurrences est une absence constatée, pas une mesure supposée.
    """

    #: `-1` et un jeton vide sur un aliment **hors catalogue** : il a été mangé — le
    #: journal le dit — mais aucune ligne ne le décrit, donc rien à corriger ni à
    #: supprimer. Même parti pris que `LoadList.orphans` : ce que l'écran ne montrerait
    #: pas deviendrait inatteignable.
    id: int = -1
    token: str = ""
    ingredient_id: str = ""
    name: str
    #: Faux quand l'aliment n'existe qu'au journal. Sa fiche propose alors de l'ajouter
    #: plutôt que de le corriger.
    catalogued: bool = True
    calories_100g: float | None = None
    protein_100g: float | None = None
    added_sugar_100g: float | None = None
    saturated_fat_100g: float | None = None
    fiber_100g: float | None = None
    portion_g: float | None = None
    barcode: str = ""
    edited_on: date | None = None
    #: Nombre de repas composés de la plage où l'aliment apparaît.
    times: int = 0
    #: Somme des poids pesés sur la plage, en grammes.
    quantity_g: float = 0.0
    #: Jour du dernier repas où il apparaît, **toutes plages confondues**. C'est lui qui
    #: trie la liste, et `null` veut dire « jamais consigné ».
    last_on: date | None = None


class CatalogCoverage(BaseModel):
    """Ce que la page ne voit pas, chiffré (`NUT-19`).

    Photo, saisie manuelle, favori et estimation IA n'enregistrent qu'un total d'assiette :
    leurs aliments n'existent nulle part. Sans ces deux nombres à l'écran, lire « 0 g de
    poulet ce mois-ci » après quatre repas notés en photo serait un mensonge crédible.
    """

    #: Repas de la plage dont les aliments sont connus — ceux qui ont été composés.
    composed: int = 0
    #: Repas de la plage, tous modes confondus.
    meals: int = 0


class CatalogView(BaseModel):
    """La page catalogue en une requête."""

    range: CatalogRange
    #: Bornes **calculées par le serveur** : le client envoie une clé de plage, il ne sait
    #: pas quel jour on est.
    start: date
    end: date
    coverage: CatalogCoverage
    entries: list[CatalogEntry]


class CatalogIntake(BaseModel):
    """Un repas où l'aliment est apparu, tel que la fiche le montre."""

    date: date
    quantity_g: float


class CatalogPeriod(BaseModel):
    """Le compte d'une plage, pour la fiche qui les montre toutes les quatre."""

    range: CatalogRange
    start: date
    end: date
    times: int = 0
    quantity_g: float = 0.0


class CatalogFood(BaseModel):
    """La fiche d'un aliment : ses valeurs, ses quatre plages, ses derniers repas."""

    entry: CatalogEntry
    periods: list[CatalogPeriod]
    #: Les derniers repas où l'aliment apparaît, du plus récent au plus ancien. C'est ce
    #: détail qui rend les 720 g **vérifiables** au lieu d'être à croire.
    recent: list[CatalogIntake]


class IngredientPayload(BaseModel):
    """Ajout d'un aliment au catalogue (`NUT-20`).

    **Au moins une valeur pour 100 g**, et le validateur l'exige. Le catalogue existe pour
    remplir des champs : une entrée qui n'en remplit aucun serait choisie dans la feuille
    « repas composé » et ne compterait pas dans le total. C'est déjà la règle qu'applique
    `remember` à l'écriture automatique ; la saisie à la main n'a pas à être plus permissive.
    """

    name: Label
    calories_100g: Per100Calories | None = None
    protein_100g: Per100G | None = None
    added_sugar_100g: Per100G | None = None
    saturated_fat_100g: Per100G | None = None
    fiber_100g: Per100G | None = None
    portion_g: QuantityG | None = None
    barcode: str = Field(default="", max_length=14)

    @model_validator(mode="after")
    def require_a_value(self) -> IngredientPayload:
        if all(
            value is None
            for value in (
                self.calories_100g,
                self.protein_100g,
                self.added_sugar_100g,
                self.saturated_fat_100g,
                self.fiber_100g,
            )
        ):
            raise ValueError("un aliment sans aucune valeur pour 100 g ne remplirait aucun champ")
        return self


class IngredientUpdate(BaseModel):
    """Correction d'une entrée du catalogue (`NUT-20`).

    Toute correction **pose le verrou** : l'entrée porte dès lors sa date de correction, et
    un scan ultérieur ne réécrit plus ses valeurs. `release` le retire — c'est la touche
    « Reprendre les valeurs de la base », qui rend la main au prochain scan.
    """

    name: Label | None = None
    calories_100g: Per100Calories | None = None
    protein_100g: Per100G | None = None
    added_sugar_100g: Per100G | None = None
    saturated_fat_100g: Per100G | None = None
    fiber_100g: Per100G | None = None
    portion_g: QuantityG | None = None
    #: Champs à **effacer**. Sans cette liste, un `null` serait indistinguable d'un champ
    #: absent, et une valeur fausse ne pourrait jamais être retirée — seulement remplacée.
    clear: list[
        Literal[
            "calories_100g",
            "protein_100g",
            "added_sugar_100g",
            "saturated_fat_100g",
            "fiber_100g",
            "portion_g",
        ]
    ] = Field(default_factory=list)
    release: bool = False
