/**
 * Un aliment scanné depuis « Noter » : combien, et pour quel repas (`NUT-28`).
 *
 * Le troisième des trois gestes — l'icône, le code, **la quantité**. Le produit vient
 * d'être lu (le catalogue d'abord, puis Open Food Facts) ; il ne reste que ce que la base
 * ne peut pas savoir.
 *
 * ## Ce que l'étape ne fait pas
 *
 * * **Elle ne préremplit pas le poids.** Un poids inscrit sans qu'on l'ait pesé serait une
 *   valeur inventée à l'écran. La portion habituelle, quand le catalogue en a une, est
 *   une **puce** qui remplit le champ d'un appui — la règle de `NUT-21`, inchangée.
 * * **Elle ne devine pas le type.** Celui de l'heure vient du serveur (`suggested_type`),
 *   et se change d'un appui.
 * * **Elle ne calcule rien.** Le repas part par `POST /api/nutrition/composed`, une ligne :
 *   le serveur multiplie, totalise, retient l'aliment au catalogue et l'écrit au journal
 *   des aliments. Les valeurs pour 100 g repartent telles qu'elles sont arrivées — c'est
 *   le contrat de la ligne d'ingrédient, pas un calcul.
 * * **Elle ne se ferme pas sur une erreur.** Un refus du serveur — 0 g, plus de 5 000 g —
 *   s'écrit sous le champ ; une panne, sous le formulaire. La saisie reste.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Chip, Field, Skeleton } from '@/components/ui';
import { nutritionApi, type Meal, type Product } from '@/features/nutrition/api';
import { ApiError } from '@/lib/api';
import { integer, num } from '@/lib/format';
import { decimal, fieldText } from '@/routes/nutrition/ingredient-draft';

import styles from './ScannedFood.module.css';

/** Une portion telle qu'elle se lit sur la puce : « 125 », « 37,5 ». */
function grams(value: number): string {
  return Number.isInteger(value) ? integer(value) : num(value, 1);
}

export function ScannedFood({
  product,
  types,
  suggested,
  typesError,
  onSaved,
  onRescan,
  onBack,
}: {
  product: Product;
  /** Les types servis par `GET /api/nutrition`, `undefined` tant qu'ils arrivent. */
  types: readonly string[] | undefined;
  /** Le type de l'heure, deviné par le serveur. */
  suggested: string | undefined;
  /** Les types n'ont pas pu être lus : sans eux, rien ne s'enregistre. */
  typesError: string | null;
  onSaved: (meal: Meal, quantity: string) => void;
  /** Le mauvais produit : revenir au viseur. */
  onRescan: () => void;
  onBack: () => void;
}) {
  const [quantity, setQuantity] = useState('');
  // `null` : celui de l'heure. Un appui en choisit un autre, et il reste choisi.
  const [chosen, setChosen] = useState<string | null>(null);
  // Le refus de l'écran — un texte qui n'est pas un nombre —, avant tout envoi.
  const [local, setLocal] = useState<string | null>(null);

  const mealType = chosen ?? suggested ?? null;

  const save = useMutation({
    mutationFn: (weight: number) =>
      nutritionApi.createComposed({
        meal_type: mealType ?? '',
        // Le repas porte le nom du produit : c'est ce qu'on cherchera au journal.
        comment: product.name,
        lines: [
          {
            name: product.name,
            quantity_g: weight,
            calories_100g: product.calories_100g,
            protein_100g: product.protein_100g,
            added_sugar_100g: product.added_sugar_100g,
            saturated_fat_100g: product.saturated_fat_100g,
            fiber_100g: product.fiber_100g,
            // Le code suit la ligne jusqu'au catalogue : c'est lui que le scan suivant relit.
            barcode: product.barcode,
          },
        ],
      }),
    onSuccess: (meal) => {
      onSaved(meal, quantity.trim());
    },
  });

  const failure = save.error;
  // Le refus d'une quantité se dit **sous son champ** : le client décide sur le champ
  // désigné par le serveur, et affiche sa phrase telle quelle.
  const quantityError =
    local ??
    (failure instanceof ApiError ? failure.messageFor('lines.0.quantity_g') : undefined) ??
    undefined;
  const formError =
    failure === null || (failure instanceof ApiError && quantityError !== undefined)
      ? null
      : failure instanceof ApiError
        ? (failure.fields[0]?.message ?? failure.message)
        : failure instanceof Error
          ? failure.message
          : 'Enregistrement impossible.';

  function submit(): void {
    const parsed = decimal(quantity);
    if (parsed === null) {
      // Le même refus que la pesée de cette feuille : un texte n'est pas un poids, et
      // l'envoyer ne ferait que rapporter un refus moins clair.
      setLocal('Un poids en grammes, par exemple 125.');
      return;
    }
    save.mutate(parsed);
  }

  return (
    <form
      className={styles.weigh}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      noValidate
    >
      {/* Un produit qu'aucune base ne chiffre se note quand même — il était dans l'assiette —
          mais il ne pèsera rien dans la journée, et l'écran le dit avant l'appui. */}
      {product.partial && (
        <p className={styles.note}>
          Aucune valeur pour 100 g n’est connue pour ce produit : le repas s’enregistrera sans
          macros.
        </p>
      )}

      <Field
        label="Quantité"
        unit="g"
        inputMode="decimal"
        autoComplete="off"
        autoFocus
        value={quantity}
        error={quantityError}
        onChange={(event) => {
          setQuantity(event.target.value);
          setLocal(null);
          save.reset();
        }}
      />

      {product.portion_g !== null && (
        <div className={styles.portion}>
          <Chip
            onClick={() => {
              setQuantity(fieldText(product.portion_g));
              setLocal(null);
              save.reset();
            }}
          >
            {`1 portion · ${grams(product.portion_g)} g`}
          </Chip>
        </div>
      )}

      <div className={styles.types}>
        <span className={styles.label}>Repas</span>
        {typesError !== null ? (
          <p className={styles.error} role="alert">
            {typesError}
          </p>
        ) : types === undefined ? (
          <Skeleton lines={1} />
        ) : (
          /* **Des pastilles qui passent à la ligne**, et non la bande qui défile : à
             402 px, la bande coupait « collation » au bord — le type de l'heure, à 16 h,
             aurait été sélectionné hors de l'écran. Quatre types tiennent sur deux lignes
             au plus ; vu en capture, aucune mesure ne l'aurait dit. */
          <div className={styles.typeChips} role="group" aria-label="Type de repas">
            {types.map((type) => (
              <Chip
                key={type}
                selected={type === mealType}
                onClick={() => {
                  setChosen(type);
                }}
              >
                {type}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {formError !== null && (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        className={styles.save}
        busy={save.isPending}
        disabled={quantity.trim() === '' || mealType === null}
      >
        Enregistrer le repas
      </Button>

      <div className={styles.actions}>
        <Button variant="quiet" disabled={save.isPending} onClick={onRescan}>
          Scanner un autre aliment
        </Button>
        <Button variant="quiet" disabled={save.isPending} onClick={onBack}>
          Retour
        </Button>
      </div>
    </form>
  );
}
