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
