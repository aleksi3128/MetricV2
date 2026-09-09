"""Repas, totaux et favoris (`NUT-01` → `NUT-10`)."""

from __future__ import annotations

import secrets
from datetime import date, datetime

from app.core.dates import local_day_of, now_local
from app.domains.ai.images import prepare_data_url
from app.domains.ai.service import AiService
from app.domains.app_settings.service import SettingsService
from app.domains.nutrition.analysis import INSTRUCTION, photo_prompt, read_estimate, text_prompt
from app.domains.nutrition.compose import compose
from app.domains.nutrition.history import build as build_history
from app.domains.nutrition.models import (
    TYPE_BY_HOUR,
    FavoriteRow,
    IngredientRow,
    MealRow,
    MealType,
)
from app.domains.nutrition.photos import PhotoError, build_path, content_type, storage_path
from app.domains.nutrition.schemas import (
    ComposedMealPayload,
    ComposePayload,
    Composition,
    DayTotals,
    Favorite,
    FavoritePayload,
    Ingredient,
    IngredientLine,
    Meal,
    MealEstimate,
    MealPayload,
    NutritionHistory,
    NutritionView,
)
from app.storage.csv_repo import CsvRepository, Row
from app.storage.errors import StorageNotFoundError
from app.storage.files import FileStore
from app.storage.paths import MEAL_FAVORITES, MEAL_INGREDIENTS, MEAL_PHOTOS, MEALS


def suggested_type(moment: datetime) -> MealType:
    """Type présélectionné selon l'heure (`NUT-03`)."""
    for until, kind in TYPE_BY_HOUR:
        if moment.hour < until:
            return kind
    return MealType.DINNER


class NutritionService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._meals: CsvRepository[MealRow] = CsvRepository(store, MEALS, MealRow)
        self._favorites: CsvRepository[FavoriteRow] = CsvRepository(
            store, MEAL_FAVORITES, FavoriteRow
        )
        self._ingredients: CsvRepository[IngredientRow] = CsvRepository(
            store, MEAL_INGREDIENTS, IngredientRow
        )
        self._settings = SettingsService(store)

    # ── Lecture ───────────────────────────────────────

    @staticmethod
    def _to_schema(row: Row[MealRow]) -> Meal:
        model = row.model
        return Meal(
            id=row.index,
            token=row.token,
            datetime=model.datetime_,
            meal_type=model.meal_type,
            comment=model.comment,
            photo=model.photo,
            protein_g=model.protein_g,
            added_sugar_g=model.added_sugar_g,
            calories=model.calories,
            source=model.source,
        )

    async def totals(self, day: date) -> DayTotals:
        """Totaux du jour seuls (`NUT-06`, `AGG-01`).

        Le tableau de bord s'arrête là : lui servir le journal complet et les favoris
        coûterait une lecture de fichier pour rien.
        """
        rows = await self._meals.read_all()
        today = [row for row in rows if local_day_of(row.model.datetime_) == day]

        values = await self._settings.values()
        protein_target = values.target_protein_g
        sugar_max = values.max_added_sugar_g

        protein = sum(row.model.protein_g or 0 for row in today)
        sugar = sum(row.model.added_sugar_g or 0 for row in today)

        calories = sum(row.model.calories or 0 for row in today)
        calorie_target = values.target_calories

        return DayTotals(
            protein_g=round(protein, 1),
            protein_target_g=protein_target,
            protein_remaining_g=round(max(0.0, protein_target - protein), 1),
            protein_ratio=min(1.0, protein / protein_target) if protein_target else 0.0,
            added_sugar_g=round(sugar, 1),
            added_sugar_max_g=sugar_max,
            # Un dépassement est un signal, pas une réussite : il se dit à part du ratio
            # de protéines.
            over_sugar=sugar > sugar_max,
            calories=calories,
            calories_target=calorie_target,
            # Même plafonnement que les protéines : l'anneau ne sait pas dessiner un
            # dépassement, et c'est le détail sous le chiffre qui le dit.
            calories_ratio=min(1.0, calories / calorie_target) if calorie_target else 0.0,
            calories_known=sum(1 for row in today if row.model.calories is not None),
            meals=len(today),
        )

    async def meal_days(self) -> set[date]:
        """Jours portant au moins un repas — source de la série d'assiduité (`AGG-03`)."""
        rows = await self._meals.read_all()
        return {local_day_of(row.model.datetime_) for row in rows}

    async def protein_points(self) -> list[tuple[date, float]]:
        """Protéines consignées par jour, en grammes.

        Seuls les jours portant au moins un repas apparaissent : un jour sans repas
        consigné n'est pas un jour à zéro gramme, c'est un jour dont on ne sait rien. Un
        repas noté **sans** ses macros, lui, compte pour zéro — il a été relevé, et
        deviner ce qu'il contenait serait inventer une mesure.

        Le rattachement au jour suit le fuseau local (`HEAT-32`), comme `meal_days` : deux
        découpages du même journal donneraient deux totaux.
        """
        rows = await self._meals.read_all()
        per_day: dict[date, float] = {}
        for row in rows:
            day = local_day_of(row.model.datetime_)
            per_day[day] = per_day.get(day, 0.0) + (row.model.protein_g or 0)
        return sorted((day, round(value, 1)) for day, value in per_day.items())

    async def history(self, today: date, range_key: str) -> NutritionHistory:
        """Grille, courbe et habitudes sur une plage (`NUT-11`).

        Le service lit et délègue : tout le calcul vit dans `history.py`, en fonctions
        pures qui s'éprouvent sans fichier ni dépôt.
        """
        rows = await self._meals.read_all()
        values = await self._settings.values()
        return build_history(
            rows,
            today=today,
            range_key=range_key,
            target=values.target_calories,
            sugar_max=values.max_added_sugar_g,
        )

    async def calorie_points(self) -> list[tuple[date, float]]:
        """Calories consignées par jour (`AGG-04`).

        Même règle que `protein_points`, et pour la même raison : seuls les jours portant
        au moins un repas **chiffré** apparaissent. Un jour noté sans ses calories n'est
        pas un jour à zéro, et le compter ainsi ferait plonger toute moyenne qui s'en
        sert.
        """
        rows = await self._meals.read_all()
        per_day: dict[date, float] = {}
        for row in rows:
            if row.model.calories is None:
                continue
            day = local_day_of(row.model.datetime_)
            per_day[day] = per_day.get(day, 0.0) + row.model.calories
        return sorted(per_day.items())

    async def view(self, day: date, *, limit: int | None = None) -> NutritionView:
        rows = await self._meals.read_all()
        today = [row for row in rows if local_day_of(row.model.datetime_) == day]

        listed = sorted(today, key=lambda row: row.model.datetime_, reverse=True)
        if limit is not None:
            listed = listed[:limit]

        return NutritionView(
            date=day,
            totals=await self.totals(day),
            meals=[self._to_schema(row) for row in listed],
            favorites=await self.favorites(),
            suggested_type=suggested_type(now_local()).value,
            types=[kind.value for kind in MealType],
            ingredients=await self.ingredients(),
        )

    # ── Écriture (`NUT-01`, `NUT-02`, `NUT-09`) ───────

    async def create(
        self,
        *,
        meal_type: str,
        comment: str | None,
        photo: bytes | None,
        protein_g: float | None,
        added_sugar_g: float | None,
        calories: int | None,
        source: str = "manual",
    ) -> Meal:
        moment = now_local()

        relative: str | None = None
        if photo:
            relative = build_path(photo, moment)
            await self._store.write_binary(
                f"{MEAL_PHOTOS}/{relative}", photo, content_type=content_type(relative)
            )

        row = await self._meals.append(
            MealRow(
                datetime_=moment,
                meal_type=meal_type,
                comment=comment,
                photo=relative,
                protein_g=protein_g,
                added_sugar_g=added_sugar_g,
                calories=calories,
                source=source,
            )
        )
        return self._to_schema(row)

    async def update(self, index: int, token: str, payload: MealPayload) -> Meal:
        rows = await self._meals.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise StorageNotFoundError("Ce repas n'existe pas.")
        existing = rows[index].model

        row = await self._meals.replace_by_token(
            index,
            token,
            MealRow(
                datetime_=payload.datetime or existing.datetime_,
                meal_type=payload.meal_type,
                comment=payload.comment,
                # Photo préservée (`NUT-09`) : corriger une macro ne fait pas perdre
                # l'image, qui est souvent la seule trace du repas.
                photo=existing.photo,
                protein_g=payload.protein_g,
                added_sugar_g=payload.added_sugar_g,
                calories=payload.calories,
                # Provenance préservée par défaut : corriger une macro estimée ne la
                # réécrit pas en saisie manuelle. Elle ne change que si la requête le
                # demande — accepter une estimation sur un repas déjà relevé.
                source=payload.source or existing.source,
            ),
        )
        return self._to_schema(row)

    async def delete(self, index: int, token: str) -> None:
        """Supprime la ligne du repas.

        La photo reste sur Nextcloud : elle est rangée par date, consultable hors de
        l'app, et l'effacer d'un clic dans une liste ferait perdre un souvenir qu'aucune
        annulation ne rendrait. La suppression du fichier reste manuelle, et assumée.
        """
        await self._meals.delete_by_token(index, token)

    async def read_photo(self, relative: str) -> tuple[bytes, str]:
        """Contenu d'une photo, après validation stricte du chemin (`NUT-08`)."""
        data = await self._store.read_binary(storage_path(relative))
        if not data:
            raise StorageNotFoundError("Cette photo n'existe pas.")
        return data, content_type(relative)

    # ── Estimation assistée (`NUT-04`) ────────────────

    @staticmethod
    async def estimate(
        ai: AiService,
        photo: bytes | None = None,
        description: str | None = None,
    ) -> MealEstimate:
        """Propose des macros pour un repas. **N'écrit rien** (`NUT-04`).

        Trois entrées, une seule sortie : une photo, une description, ou les deux. C'est
        ce qui rend les trois premiers modes de saisie possibles sans trois chemins de
        code — le mode choisi à l'écran ne se lit nulle part ici, seule compte la matière
        qui arrive.

        **Sans photo, la demande ne va pas aux modèles vision.** La cascade choisit ses
        candidats sur la présence d'une image (`IA-04`) : une description seule ouvre donc
        tout le catalogue gratuit au lieu de sa moitié, ce qui la rend plus robuste au
        quota, pas moins.

        Volontairement statique : cette opération ne touche pas au stockage, et le dire
        dans la signature vaut mieux que le promettre en commentaire.
        """
        said = (description or "").strip()

        if photo:
            payload = await ai.ask_json(
                instruction=INSTRUCTION,
                prompt=photo_prompt(said),
                images=[prepare_data_url(photo)],
                # Une estimation tient en cinq nombres : au-delà, on paie le monologue d'un
                # modèle à raisonnement visible, que l'extraction jettera de toute façon.
                max_tokens=500,
            )
            return read_estimate(payload)

        if not said:
            raise PhotoError("Une estimation a besoin d'une photo ou d'une description.")

        payload = await ai.ask_json(
            instruction=INSTRUCTION,
            prompt=text_prompt(said),
            max_tokens=500,
        )
        return read_estimate(payload)

    async def estimate_meal(self, ai: AiService, index: int) -> MealEstimate:
        """Estime les macros d'un repas **déjà enregistré**, depuis sa photo rangée.

        C'est le cas courant et non l'exception : l'écran promet qu'« une photo suffit,
        les chiffres peuvent venir après ». Sans cette porte, « après » n'existerait que
        pour les repas dont on a gardé le fichier d'origine sous la main.
        """
        rows = await self._meals.read_all()
        if not 0 <= index < len(rows):
            raise StorageNotFoundError("Ce repas n'existe pas.")

        relative = rows[index].model.photo
        if not relative:
            raise StorageNotFoundError("Ce repas n'a pas de photo à analyser.")

        data, _ = await self.read_photo(relative)
        return await self.estimate(ai, data)

    # ── Repas composé (`NUT-12`) ──────────────────────

    @staticmethod
    def composition(payload: ComposePayload) -> Composition:
        """Le total d'un plat depuis ses ingrédients. **N'écrit rien** (`NUT-12`).

        Statique, et le dire dans la signature vaut mieux que de le promettre en
        commentaire : cette opération ne touche pas au stockage.
        """
        return compose(payload.lines)

    async def create_composed(self, payload: ComposedMealPayload) -> Meal:
        """Compose, enregistre, et retient les ingrédients (`NUT-12`).

        **Le total est recalculé ici**, il n'est pas repris du client. C'est la même
        raison que partout ailleurs : ce qui entre dans le fichier doit venir du serveur,
        sans quoi un client qui se tromperait — ou qui aurait vieilli — écrirait un total
        que rien n'a vérifié.

        Les ingrédients rejoignent le catalogue **après** l'écriture du repas. Dans
        l'autre ordre, un échec d'écriture du journal laisserait un catalogue enrichi pour
        un repas qui n'existe pas ; ici, le pire est un repas juste sans son catalogue à
        jour, ce qui se rattrape à la composition suivante.
        """
        total = compose(payload.lines)

        meal = await self.create(
            meal_type=payload.meal_type,
            comment=payload.comment,
            photo=None,
            protein_g=total.protein_g if not total.empty else None,
            added_sugar_g=total.added_sugar_g if not total.empty else None,
            calories=total.calories if not total.empty else None,
        )
        await self.remember(payload.lines)
        return meal

    async def ingredients(self) -> list[Ingredient]:
        """Le catalogue, sans les lignes qu'on ne saurait pas rejouer."""
        rows = await self._ingredients.read_all()
        return [
            Ingredient(
                id=row.index,
                token=row.token,
                ingredient_id=row.model.id,
                name=row.model.name,
                calories_100g=row.model.calories_100g,
                protein_100g=row.model.protein_100g,
                added_sugar_100g=row.model.added_sugar_100g,
            )
            for row in rows
            if row.model.id and row.model.name
        ]

    async def remember(self, lines: list[IngredientLine]) -> None:
        """Retient les valeurs pour 100 g des ingrédients d'un plat (`NUT-12`).

        **La dernière saisie gagne.** Un ingrédient déjà connu voit ses valeurs
        remplacées plutôt que conservées : on recompose avec l'emballage qu'on a sous la
        main, et c'est celui-là qui est juste aujourd'hui. Le rapprochement se fait sur le
        nom réduit — même casse, mêmes espaces —, jamais approximativement : deux yaourts
        dont les noms diffèrent d'une lettre sont deux produits.

        Une ligne sans aucune valeur n'entre pas au catalogue : elle n'a rien à y
        apprendre, et y figurer ferait une suggestion qui ne remplirait aucun champ.
        """
        useful = [
            line
            for line in lines
            if line.calories_100g is not None
            or line.protein_100g is not None
            or line.added_sugar_100g is not None
        ]
        if not useful:
            return

        rows = await self._ingredients.read_all(fresh=True)
        by_name = {row.model.name.strip().casefold(): row for row in rows if row.model.name}

        for line in useful:
            existing = by_name.get(line.name.strip().casefold())
            model = IngredientRow(
                id=existing.model.id if existing and existing.model.id else secrets.token_hex(6),
                name=line.name.strip(),
                calories_100g=line.calories_100g,
                protein_100g=line.protein_100g,
                added_sugar_100g=line.added_sugar_100g,
            )
            if existing is None:
                await self._ingredients.append(model)
            else:
                # La garde porte sur la ligne **qu'on vient de lire**, pas sur un jeton
                # venu du client : celui-ci n'a jamais vu cette ligne, il n'a rien à
                # confirmer. C'est une conséquence de l'enregistrement du repas, pas une
                # correction voulue.
                await self._ingredients.replace(existing.index, existing.model, model)

    # ── Favoris (`NUT-10`) ────────────────────────────

    @staticmethod
    def _favorite_to_schema(row: Row[FavoriteRow]) -> Favorite:
        return Favorite(
            id=row.index,
            token=row.token,
            favorite_id=row.model.id,
            name=row.model.name,
            protein_g=row.model.protein_g,
            added_sugar_g=row.model.added_sugar_g,
            calories=row.model.calories,
        )

    async def favorites(self) -> list[Favorite]:
        rows = await self._favorites.read_all()
        # Un favori sans identifiant ne peut pas être rejoué : on l'écarte de la liste
        # plutôt que d'offrir un bouton qui échouerait.
        return [self._favorite_to_schema(row) for row in rows if row.model.id]

    async def add_favorite(self, payload: FavoritePayload) -> Favorite:
        row = await self._favorites.append(
            FavoriteRow(
                id=secrets.token_hex(6),
                name=payload.name,
                protein_g=payload.protein_g,
                added_sugar_g=payload.added_sugar_g,
                calories=payload.calories,
            )
        )
        return self._favorite_to_schema(row)

    async def remove_favorite(self, index: int, token: str) -> None:
        await self._favorites.delete_by_token(index, token)

    async def replay_favorite(self, favorite_id: str) -> Meal:
        """Rejoue un repas récurrent en une action, sans photo ni IA (`NUT-10`)."""
        favorite = next(
            (item for item in await self.favorites() if item.favorite_id == favorite_id), None
        )
        if favorite is None:
            raise StorageNotFoundError("Ce repas favori n'existe pas.")

        return await self.create(
            meal_type=suggested_type(now_local()).value,
            comment=favorite.name,
            photo=None,
            protein_g=favorite.protein_g,
            added_sugar_g=favorite.added_sugar_g,
            calories=favorite.calories,
        )
