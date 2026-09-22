/**
 * Ce qu'une fiche d'aliment tient pendant la saisie, et ce qu'elle devient (`NUT-20`).
 *
 * Séparé des deux feuilles pour la raison qui a déjà sorti `ingredient-draft.ts` de
 * `Ingredients.tsx` : ce qui se calcule sans rien rendre s'éprouve sur des valeurs fixes,
 * sans monter un arbre React. Les feuilles, elles, se regardent.
 *
 * Un seul brouillon pour l'ajout et la correction : ce sont les mêmes sept champs, et deux
 * formes auraient fini par diverger — c'est précisément ce qui était arrivé aux sucres des
 * favoris quand trois surfaces énuméraient les valeurs chacune de son côté.
 */

import type {
  CatalogEntry,
  CatalogPeriod,
  IngredientPayload,
  IngredientUpdate,
  Product,
} from '@/features/nutrition/api';
import { integer, num, plural, relativeDay } from '@/lib/format';

import { decimal, fieldText } from './ingredient-draft';
import type { Macro } from './meal-draft';

/** Une fiche en cours de saisie. Des chaînes : un champ passe par « 17 » avant « 178 ». */
export interface FoodDraft {
  name: string;
  calories_100g: string;
  protein_100g: string;
  added_sugar_100g: string;
  saturated_fat_100g: string;
  fiber_100g: string;
  /** La portion habituelle (`NUT-21`). Facultative, et jamais déduite d'une moyenne. */
  portion_g: string;
  barcode: string;
}

/** Les cinq valeurs pour 100 g, dans une seule liste — pour qu'aucune ne s'oublie. */
export const PER_100_FIELDS = [
  'calories_100g',
  'protein_100g',
  'added_sugar_100g',
  'saturated_fat_100g',
  'fiber_100g',
] as const;

/**
 * La valeur pour 100 g qui répond à chaque macro.
 *
 * L'ordre d'affichage reste celui de `NUTRIENTS` : ce module dit *quel champ*, pas *dans
 * quel ordre*. Deux listes d'ordre se seraient décollées au premier ajout.
 */
export const PER_100: Record<Macro, (typeof PER_100_FIELDS)[number]> = {
  protein_g: 'protein_100g',
  added_sugar_g: 'added_sugar_100g',
  calories: 'calories_100g',
  saturated_fat_g: 'saturated_fat_100g',
  fiber_g: 'fiber_100g',
};

export function emptyFood(name = ''): FoodDraft {
  return {
    name,
    calories_100g: '',
    protein_100g: '',
    added_sugar_100g: '',
    saturated_fat_100g: '',
    fiber_100g: '',
    portion_g: '',
    barcode: '',
  };
}

/** Le produit scanné, en brouillon. Les valeurs absentes restent vides, jamais à zéro. */
export function foodFromProduct(product: Product): FoodDraft {
  return {
    ...emptyFood(product.name),
    barcode: product.barcode,
    calories_100g: fieldText(product.calories_100g),
    protein_100g: fieldText(product.protein_100g),
    added_sugar_100g: fieldText(product.added_sugar_100g),
    saturated_fat_100g: fieldText(product.saturated_fat_100g),
    fiber_100g: fieldText(product.fiber_100g),
  };
}

/** L'entrée du catalogue, en brouillon de correction. */
export function foodFromEntry(entry: CatalogEntry): FoodDraft {
  return {
    name: entry.name,
    calories_100g: fieldText(entry.calories_100g),
    protein_100g: fieldText(entry.protein_100g),
    added_sugar_100g: fieldText(entry.added_sugar_100g),
    saturated_fat_100g: fieldText(entry.saturated_fat_100g),
    fiber_100g: fieldText(entry.fiber_100g),
    portion_g: fieldText(entry.portion_g),
    barcode: entry.barcode,
  };
}

/**
 * Cette fiche a-t-elle de quoi entrer au catalogue ?
 *
 * Un nom, et au moins une valeur pour 100 g. Le catalogue existe pour **remplir des
 * champs** : une entrée qui n'en remplirait aucun serait proposée dans un plat sans rien y
 * apporter. Le serveur la refuse ; l'écran n'envoie pas une requête dont il connaît la
 * réponse.
 */
export function hasAnyValue(draft: FoodDraft): boolean {
  if (draft.name.trim() === '') return false;
  return PER_100_FIELDS.some((field) => decimal(draft[field]) !== null);
}

export function toPayload(draft: FoodDraft): IngredientPayload {
  return {
    name: draft.name.trim(),
    calories_100g: decimal(draft.calories_100g),
    protein_100g: decimal(draft.protein_100g),
    added_sugar_100g: decimal(draft.added_sugar_100g),
    saturated_fat_100g: decimal(draft.saturated_fat_100g),
    fiber_100g: decimal(draft.fiber_100g),
    portion_g: decimal(draft.portion_g),
    barcode: draft.barcode,
  };
}

/**
 * Ce qu'une correction envoie.
 *
 * Un champ vidé part dans `clear`, un champ rempli part dans le corps. Sans cette
 * distinction, un champ absent et un champ à `null` diraient la même chose au serveur, et
 * une valeur fausse ne pourrait que se remplacer — jamais se retirer.
 */
export function toUpdate(draft: FoodDraft): IngredientUpdate {
  const payload: IngredientUpdate = { name: draft.name.trim() };
  const clear: string[] = [];

  for (const field of [...PER_100_FIELDS, 'portion_g'] as const) {
    const value = decimal(draft[field]);
    if (value === null) clear.push(field);
    else payload[field] = value;
  }

  payload.clear = clear;
  return payload;
}

/**
 * Ce qu'une ligne pèse sur la plage : le nombre de fois d'abord, la quantité ensuite.
 *
 * Un tiret quand l'aliment n'a rien à dire sur cette plage. « 0 fois · 0 g » se lirait
 * comme une mesure, et ce n'en est pas une.
 */
export function reading(counted: { times: number; quantity_g: number }): string {
  if (counted.times === 0) return '—';
  const times = `${integer(counted.times)} ${plural(counted.times, 'fois', 'fois')}`;
  return `${times} · ${num(counted.quantity_g, 0)} g`;
}

export function periodReading(period: CatalogPeriod): string {
  return reading(period);
}

/** Depuis quand on n'en a pas mangé. `null` quand l'aliment n'a jamais été consigné. */
export function seenOn(entry: CatalogEntry): string | null {
  return entry.last_on === null ? null : relativeDay(entry.last_on);
}

/**
 * La clé d'ouverture d'une fiche : l'identifiant du catalogue, ou le nom du journal.
 *
 * Un aliment hors catalogue n'a pas d'identifiant — il n'a que son nom, et c'est par lui
 * que le serveur le retrouvera. Une fiche inatteignable pour la moitié des lignes de la
 * page aurait été une demi-fonctionnalité.
 */
export function foodKey(entry: CatalogEntry): string {
  return entry.ingredient_id === '' ? entry.name : entry.ingredient_id;
}
