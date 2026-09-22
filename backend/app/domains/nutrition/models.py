"""Modèles CSV de la nutrition.

`nutrition/meals.csv` : datetime, meal_type, comment, photo, protein_g, added_sugar_g,
calories, source, saturated_fat_g, fiber_g
`nutrition/favorites.csv` : id, name, protein_g, added_sugar_g, calories, saturated_fat_g,
fiber_g
`nutrition/ingredients.csv` : id, name, calories_100g, protein_100g, added_sugar_100g,
saturated_fat_100g, fiber_100g, portion_g, barcode, edited_on
`nutrition/intake.csv` : datetime, ingredient_id, name, quantity_g

Les deux dernières colonnes de chaque fichier sont venues avec `NUT-16`, **en fin de
ligne** et non à côté des autres valeurs : ces fichiers s'ouvrent dans un tableur, et une
formule qui visait les calories doit continuer de les viser. Une ligne d'avant les porte
vides — « non relevé », jamais zéro (`STO-04`).
"""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from app.storage.model import CsvModel


class MealType(StrEnum):
    """Typage du repas (`NUT-03`)."""

    BREAKFAST = "petit-déjeuner"
    LUNCH = "déjeuner"
    DINNER = "dîner"
    SNACK = "collation"


class MealRow(CsvModel):
    """Un repas.

    `photo` porte le chemin **relatif** au dossier des photos. Le stocker relatif plutôt
    qu'absolu permet de déplacer le dossier de données sans réécrire le fichier.
    """

    datetime_: datetime
    meal_type: str
    comment: str | None = None
    photo: str | None = None
    protein_g: float | None = None
    added_sugar_g: float | None = None
    calories: int | None = None
    #: `manual` ou `ai` — l'origine d'une estimation reste lisible dans le fichier.
    source: str = "manual"
    saturated_fat_g: float | None = None
    fiber_g: float | None = None

    @classmethod
    def csv_columns(cls) -> tuple[str, ...]:
        return (
            "datetime",
            "meal_type",
            "comment",
            "photo",
            "protein_g",
            "added_sugar_g",
            "calories",
            "source",
            "saturated_fat_g",
            "fiber_g",
        )

    def to_csv(self) -> dict[str, str]:
        row = super().to_csv()
        return {"datetime": row.pop("datetime_"), **row}

    @classmethod
    def from_csv(cls, row):  # type: ignore[no-untyped-def]
        mapped = dict(row)
        if "datetime" in mapped:
            mapped["datetime_"] = mapped.pop("datetime")
        return super().from_csv(mapped)


class FavoriteRow(CsvModel):
    """Un repas récurrent, rejouable en une action (`NUT-10`).

    Catalogue et non mesure : une ligne incomplète est ignorée, elle ne rend pas le
    fichier illisible (`STO-04`).
    """

    id: str = ""
    name: str = ""
    protein_g: float | None = None
    added_sugar_g: float | None = None
    calories: int | None = None
    saturated_fat_g: float | None = None
    fiber_g: float | None = None


class IngredientRow(CsvModel):
    """Un ingrédient du catalogue, avec ses valeurs **pour 100 g** (`NUT-12`).

    Catalogue et non mesure, comme `FavoriteRow` : une ligne incomplète est ignorée à la
    lecture plutôt que de rendre le fichier illisible (`STO-04`). C'est ce qui permet de
    le corriger au tableur — et c'est bien l'usage : un catalogue d'ingrédients se
    constitue au fil des courses, pas dans un écran.
    """

    id: str = ""
    name: str = ""
    calories_100g: float | None = None
    protein_100g: float | None = None
    added_sugar_100g: float | None = None
    saturated_fat_100g: float | None = None
    fiber_100g: float | None = None
    #: Le poids habituel d'une portion (`NUT-21`). Renseigné à la main, jamais déduit d'une
    #: moyenne : une moyenne de portions passées serait une mesure inventée sur la
    #: suivante.
    portion_g: float | None = None
    #: Le code-barres du produit scanné (`NUT-20`), pour le reconnaître et relire sa fiche.
    #: La **marque** n'est toujours pas enregistrée : `NUT-13` a tranché, elle aide à
    #: reconnaître mais n'est pas une mesure.
    barcode: str = ""
    #: Le jour d'une correction à la main (`NUT-20`), et rien d'autre : non vide, elle
    #: **empêche** un scan ultérieur d'écraser les valeurs. Sans ce verrou, « la dernière
    #: saisie gagne » avalerait la correction au repas suivant, sans rien dire.
    edited_on: date | None = None


class IntakeRow(CsvModel):
    """Un aliment pesé dans un repas composé (`NUT-18`).

    **Une mesure, pas un catalogue** — à la différence de `FavoriteRow` et
    `IngredientRow` juste au-dessus. La tolérance de `STO-04` ne s'applique donc pas :
    une ligne illisible lève au lieu d'être ignorée, parce que l'ignorer ferait mentir une
    somme sans prévenir.

    `datetime_` est celui **du repas**, pas celui de l'écriture. C'est ce qui permet de
    compter les repas composés d'une période — le nombre d'horodatages distincts — sans
    ajouter de colonne à `meals.csv`, et donc sans changer le sens de `source` pour les
    repas déjà écrits.

    `ingredient_id` peut être vide : un aliment sans aucune valeur — « 150 g de légumes » —
    n'entre pas au catalogue, mais il était dans l'assiette et entre ici. `name` est
    recopié même quand l'identifiant est là, ce qui est redondant et voulu : le fichier
    s'ouvre dans un tableur, et une colonne d'identifiants hexadécimaux sans nom en face
    serait illisible.
    """

    datetime_: datetime
    ingredient_id: str = ""
    name: str = ""
    quantity_g: float = 0.0

    @classmethod
    def csv_columns(cls) -> tuple[str, ...]:
        return ("datetime", "ingredient_id", "name", "quantity_g")

    def to_csv(self) -> dict[str, str]:
        row = super().to_csv()
        return {"datetime": row.pop("datetime_"), **row}

    @classmethod
    def from_csv(cls, row):  # type: ignore[no-untyped-def]
        mapped = dict(row)
        if "datetime" in mapped:
            mapped["datetime_"] = mapped.pop("datetime")
        return super().from_csv(mapped)


#: Bornes horaires du type suggéré (`NUT-03`). Le type reste modifiable : ce n'est
#: qu'une présélection, elle doit tomber juste souvent, pas toujours.
TYPE_BY_HOUR: tuple[tuple[int, MealType], ...] = (
    (11, MealType.BREAKFAST),
    (15, MealType.LUNCH),
    (18, MealType.SNACK),
    (24, MealType.DINNER),
)
