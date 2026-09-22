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
   * Les cinq valeurs pour 100 g. **Elles ne sont plus à l'écran** (`NUT-14`) : elles
   * viennent d'un code-barres ou du catalogue, et elles repartent au serveur qui
   * totalise. Les laisser modifiables demandait de lire un emballage à chaque repas —
   * c'est précisément le geste que le scan a supprimé.
   */
  calories_100g: string;
  protein_100g: string;
  added_sugar_100g: string;
  saturated_fat_100g: string;
  fiber_100g: string;
  /**
   * Vrai quand la ligne a été ajoutée à la main, et que son nom reste donc à saisir.
   *
   * Une ligne scannée porte le nom que la base a donné : l'afficher en champ de saisie
   * inviterait à le retoucher, et le catalogue se rattache au nom. Une ligne manuelle,
   * elle, n'a que son nom pour exister.
   */
  manual: boolean;
  /**
   * La portion habituelle de cet aliment au catalogue (`NUT-21`), en grammes.
   *
   * **Elle ne remplit pas le champ de poids.** Un poids inscrit sans qu'on l'ait pesé
   * serait une valeur inventée à l'écran, et le marquer « proposé » créerait un cinquième
   * vocabulaire de proposition là où le dépôt en réserve deux à ce qu'un modèle rend. Elle
   * sert une **puce** sous le champ, qui le remplit d'un appui — le geste économisé est le
   * même, et rien n'entre dans un champ sans que le doigt l'ait demandé.
   */
  portion_g: string;
  /**
   * D'où vient cette ligne, pour la fiche que le nom ouvre (`NUT-14`).
   *
   * La **marque** ne part jamais au serveur : elle sert à reconnaître le produit à
   * l'écran — deux yaourts nature d'une même marque ne se distinguent que par leur code —
   * et `NUT-13` a tranché qu'elle n'est pas une mesure. Le **code**, lui, suit la ligne
   * depuis `NUT-20` : il est ce qui permettra de relire la fiche du produit plus tard.
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
    saturated_fat_100g: '',
    fiber_100g: '',
    manual: true,
    portion_g: '',
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
    saturated_fat_100g: fieldText(product.saturated_fat_100g),
    fiber_100g: fieldText(product.fiber_100g),
  };
}

/** Cette ligne porte-t-elle des valeurs ? Sinon elle compte pour zéro dans le total. */
export function hasValues(row: IngredientDraft): boolean {
  return per100(row).some((field) => field.trim() !== '');
}

/** Les cinq valeurs pour 100 g d'une ligne — une seule liste, pour qu'aucune ne s'oublie. */
function per100(row: IngredientDraft): string[] {
  return [
    row.calories_100g,
    row.protein_100g,
    row.added_sugar_100g,
    row.saturated_fat_100g,
    row.fiber_100g,
  ];
}

/** Une ligne à laquelle on n'a rien touché — celle qu'un scan remplace plutôt que suivre. */
export function isBlank(row: IngredientDraft): boolean {
  return [row.name, row.quantity_g, ...per100(row)].every((field) => field.trim() === '');
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
        saturated_fat_100g: decimal(row.saturated_fat_100g),
        fiber_100g: decimal(row.fiber_100g),
        // Le code suit la ligne jusqu'au catalogue (`NUT-20`) : sans lui, une entrée
        // arrivée par un scan ne pourrait plus jamais être relue chez Open Food Facts.
        barcode: row.barcode,
      },
    ];
  });
}

/** Écrit un nombre du catalogue dans un champ : virgule décimale, aucun séparateur. */
export function fieldText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}
