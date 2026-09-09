/**
 * Ce qu'une ligne d'ingrédient tient pendant la saisie, et ce qu'elle devient.
 *
 * Séparé de `Ingredients.tsx` pour la même raison que `estimate.ts` l'est de la feuille :
 * ce qui se calcule sans rien rendre s'éprouve sur des valeurs fixes, sans monter un
 * arbre React. La feuille, elle, se regarde.
 */

import type { IngredientLine, Product } from '@/features/nutrition/api';

/** Une ligne en cours de saisie. Des chaînes : un champ passe par « 17 » avant « 178 ». */
export interface IngredientDraft {
  /** Clé de rendu stable. Sans elle, retirer une ligne remonterait la saisie des suivantes. */
  key: string;
  name: string;
  quantity_g: string;
  /**
   * Les trois valeurs pour 100 g. **Elles ne sont plus à l'écran** (`NUT-14`) : elles
   * viennent d'un code-barres ou du catalogue, et elles repartent au serveur qui
   * totalise. Les laisser modifiables demandait de lire un emballage à chaque repas —
   * c'est précisément le geste que le scan a supprimé.
   */
  calories_100g: string;
  protein_100g: string;
  added_sugar_100g: string;
  /**
   * Vrai quand la ligne a été ajoutée à la main, et que son nom reste donc à saisir.
   *
   * Une ligne scannée porte le nom que la base a donné : l'afficher en champ de saisie
   * inviterait à le retoucher, et le catalogue se rattache au nom. Une ligne manuelle,
   * elle, n'a que son nom pour exister.
   */
  manual: boolean;
  /**
   * D'où vient cette ligne, pour la fiche que le nom ouvre (`NUT-14`).
   *
   * Ni l'un ni l'autre ne part au serveur : `toLines` n'envoie que ce que le calcul
   * demande. Ils servent à **reconnaître** le produit — deux yaourts nature d'une même
   * marque ne se distinguent que par leur code.
   */
  brand: string;
  barcode: string;
}

let counter = 0;

export function emptyIngredient(): IngredientDraft {
  counter += 1;
  return {
    key: `ingredient-${String(counter)}`,
    name: '',
    quantity_g: '',
    calories_100g: '',
    protein_100g: '',
    added_sugar_100g: '',
    manual: true,
    brand: '',
    barcode: '',
  };
}

/**
 * La ligne d'un produit scanné (`NUT-13`).
 *
 * Les valeurs arrivent **en clair et modifiables**, comme celles d'un ingrédient rappelé
 * du catalogue : c'est une lecture de base de données, pas une proposition d'un modèle. Un
 * produit dont Open Food Facts ignore les macros donne des champs vides — jamais des
 * zéros, qui passeraient pour une mesure.
 *
 * La quantité reste vide : c'est la seule chose que la base ne peut pas savoir, et c'est
 * exactement ce que le doigt vient taper ensuite.
 */
export function ingredientFromProduct(product: Product): IngredientDraft {
  return {
    ...emptyIngredient(),
    manual: false,
    name: product.name,
    brand: product.brand ?? '',
    barcode: product.barcode,
    calories_100g: fieldText(product.calories_100g),
    protein_100g: fieldText(product.protein_100g),
    added_sugar_100g: fieldText(product.added_sugar_100g),
  };
}

/** Cette ligne porte-t-elle des valeurs ? Sinon elle compte pour zéro dans le total. */
export function hasValues(row: IngredientDraft): boolean {
  return [row.calories_100g, row.protein_100g, row.added_sugar_100g].some(
    (field) => field.trim() !== '',
  );
}

/** Une ligne à laquelle on n'a rien touché — celle qu'un scan remplace plutôt que suivre. */
export function isBlank(row: IngredientDraft): boolean {
  return [
    row.name,
    row.quantity_g,
    row.calories_100g,
    row.protein_100g,
    row.added_sugar_100g,
  ].every((field) => field.trim() === '');
}

/** Un champ de texte vers le nombre que l'API attend, ou `null` s'il est vide. */
export function decimal(value: string): number | null {
  const cleaned = value.replace(',', '.').trim();
  if (cleaned === '') return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Les lignes prêtes à partir au calcul.
 *
 * Une ligne sans nom ou sans quantité est **écartée** plutôt que refusée : c'est la ligne
 * vide qu'on vient d'ajouter et qu'on n'a pas encore remplie, pas une erreur de saisie.
 * Le serveur, lui, refuse une quantité nulle — ce qui reste la bonne réponse pour une
 * ligne qu'on a vraiment tenté d'envoyer.
 */
export function toLines(rows: readonly IngredientDraft[]): IngredientLine[] {
  return rows.flatMap((row) => {
    const quantity = decimal(row.quantity_g);
    if (row.name.trim() === '' || quantity === null || quantity <= 0) return [];
    return [
      {
        name: row.name.trim(),
        quantity_g: quantity,
        calories_100g: decimal(row.calories_100g),
        protein_100g: decimal(row.protein_100g),
        added_sugar_100g: decimal(row.added_sugar_100g),
      },
    ];
  });
}

/** Écrit un nombre du catalogue dans un champ : virgule décimale, aucun séparateur. */
export function fieldText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}
