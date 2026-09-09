"""Composer un repas depuis ses ingrédients (`NUT-12`).

Le quatrième mode de saisie demandait de connaître les macros de son assiette. On ne les
connaît presque jamais : on connaît celles **de l'emballage**, pour 100 g, et le poids
qu'on en a mis. Ce module fait le passage de l'un à l'autre.

## Pourquoi ce calcul est ici et pas à l'écran

C'est une multiplication de trois lignes, et c'est exactement le genre de calcul que
l'invariant du projet interdit au client. Deux raisons concrètes, pas théoriques :

* **l'arrondi**. 179 g de riz à 356 kcal/100 g font 637,24 kcal. Arrondi par ligne puis
  sommé, ou sommé puis arrondi, on n'obtient pas le même nombre — et le repas enregistré
  ne correspondrait plus à ce que l'écran a montré ;
* **le second appelant**. L'assistant compose des repas (`IA-05`) ; s'il devait refaire ce
  calcul de son côté, la deuxième implémentation dériverait de la première au premier cas
  limite.

## Une ligne sans valeur n'est pas une ligne à zéro

Un ingrédient dont on n'a noté que le poids — « 150 g de légumes » — n'apporte rien au
total, mais il **reste dans le détail** : il dit ce qu'il y avait dans l'assiette. Le
compter pour zéro calorie serait affirmer qu'il n'en apporte pas, ce qu'on ne sait pas.
"""

from __future__ import annotations

from app.domains.nutrition.schemas import ComposedLine, Composition, IngredientLine


def _share(per_100g: float | None, quantity_g: float) -> float:
    """Ce qu'apporte une quantité, depuis une valeur pour 100 g. Zéro si on ne sait pas."""
    return 0.0 if per_100g is None else per_100g * quantity_g / 100


def compose(lines: list[IngredientLine]) -> Composition:
    """Le total d'un plat, et le détail de chaque ligne.

    **Les lignes sont arrondies pour l'affichage, le total ne l'est pas pour autant** : il
    se calcule sur les valeurs exactes, puis s'arrondit une seule fois. Sommer les
    arrondis ferait dériver le total de quelques kilocalories sur une dizaine
    d'ingrédients, et ce serait l'écart entre ce que l'écran montre et ce que le fichier
    reçoit.
    """
    calories = sum(_share(line.calories_100g, line.quantity_g) for line in lines)
    protein = sum(_share(line.protein_100g, line.quantity_g) for line in lines)
    sugar = sum(_share(line.added_sugar_100g, line.quantity_g) for line in lines)

    known = any(
        line.calories_100g is not None
        or line.protein_100g is not None
        or line.added_sugar_100g is not None
        for line in lines
    )

    return Composition(
        lines=[
            ComposedLine(
                name=line.name,
                quantity_g=line.quantity_g,
                calories=round(_share(line.calories_100g, line.quantity_g)),
                protein_g=round(_share(line.protein_100g, line.quantity_g), 1),
                added_sugar_g=round(_share(line.added_sugar_100g, line.quantity_g), 1),
            )
            for line in lines
        ],
        calories=round(calories),
        protein_g=round(protein, 1),
        added_sugar_g=round(sugar, 1),
        empty=not known,
    )
