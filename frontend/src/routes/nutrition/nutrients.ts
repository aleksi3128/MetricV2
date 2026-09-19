/**
 * Les cinq valeurs d'un repas, et comment l'écran les nomme (`NUT-16`).
 *
 * Trois surfaces les énumèrent — la feuille d'ajout, la fiche d'un repas et celle d'un
 * aliment — et chacune les écrivait à la main tant qu'elles étaient trois. À cinq, une
 * liste recopiée trois fois finit par en oublier une quelque part : c'est exactement ce
 * qui était arrivé aux sucres des favoris.
 *
 * **Du vocabulaire, pas un calcul.** Ce module ne sait rien des valeurs elles-mêmes.
 */

import type { Macro } from './meal-draft';

export interface NutrientSpec {
  key: Macro;
  /** Libellé d'un champ de saisie, unité comprise : « Protéines (g) ». */
  field: string;
  /** Tête d'une case de fiche, en minuscules comme le reste des mentions en chasse fixe. */
  head: string;
  /** Unité écrite après la valeur. Vide pour les calories : la tête dit déjà « kcal ». */
  unit: string;
  /** Pas des touches « − » et « + ». */
  step: number;
  inputMode: 'decimal' | 'numeric';
}

/**
 * Dans l'ordre où l'application les a toujours dites, les deux nouvelles à la fin — comme
 * leurs colonnes dans le fichier. Remettre les calories en tête aurait déplacé sous le
 * pouce trois pas-à-pas qu'on a l'habitude de trouver à leur place.
 */
export const NUTRIENTS: readonly NutrientSpec[] = [
  {
    key: 'protein_g',
    field: 'Protéines (g)',
    head: 'protéines',
    unit: 'g',
    step: 5,
    inputMode: 'decimal',
  },
  {
    key: 'added_sugar_g',
    field: 'Sucres (g)',
    head: 'sucres',
    unit: 'g',
    step: 5,
    inputMode: 'decimal',
  },
  { key: 'calories', field: 'Calories', head: 'kcal', unit: '', step: 50, inputMode: 'numeric' },
  {
    key: 'saturated_fat_g',
    field: 'AG saturés (g)',
    head: 'AG saturés',
    unit: 'g',
    step: 1,
    inputMode: 'decimal',
  },
  { key: 'fiber_g', field: 'Fibres (g)', head: 'fibres', unit: 'g', step: 1, inputMode: 'decimal' },
];
