/**
 * Ce que la correction d'un repas tient pendant la saisie, et ce qu'elle envoie (`NUT-15`).
 *
 * Séparé de la fiche pour la raison qui a séparé `ingredient-draft.ts` : ce qui se décide
 * sans rien rendre s'éprouve sur des valeurs fixes.
 *
 * ## Un champ illisible n'est pas un champ vide
 *
 * La feuille d'ajout envoie ses nombres en texte, dans un formulaire multipart, et c'est le
 * serveur qui refuse « 3O ». La correction part en JSON : il faut un nombre, et la
 * conversion se fait donc ici. `decimal()` rendait `null` sur tout ce qu'il ne savait pas
 * lire — et `null` **efface**. Une lettre tapée à la place d'un zéro aurait supprimé la
 * valeur rangée, sans un mot, sur une application qui n'a aucune annulation.
 *
 * D'où trois issues et non deux : un nombre, rien, ou illisible. La dernière bloque
 * l'enregistrement et se dit sous le champ.
 */

import type { Meal, MealUpdate } from '@/features/nutrition/api';

import { fieldText } from './ingredient-draft';
import type { Macro } from './meal-draft';
import { NUTRIENTS } from './nutrients';

export type CorrectionValues = Record<Macro, string> & { meal_type: string; comment: string };

/** Les champs pré-remplis avec la ligne telle que le serveur l'a rendue. */
export function correctionFrom(meal: Meal): CorrectionValues {
  const values = { meal_type: meal.meal_type, comment: meal.comment ?? '' } as CorrectionValues;
  for (const { key } of NUTRIENTS) values[key] = fieldText(meal[key]);
  return values;
}

/** Même forme que ce que lit le `Stepper` : pas de signe, une virgule ou un point. */
const DECIMAL = /^\d+(?:[.,]\d+)?$/;
/** Les calories sont un entier pour le serveur : « 540,5 » serait refusé en anglais. */
const INTEGER = /^\d+$/;

/**
 * Le texte d'un champ vers ce que l'API attend.
 *
 * `null` pour un champ vide — la valeur s'efface, c'est ce que le geste dit —, `undefined`
 * pour un texte qui n'est pas un nombre.
 */
export function readField(text: string, integer = false): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!(integer ? INTEGER : DECIMAL).test(trimmed)) return undefined;
  return Number(trimmed.replace(',', '.'));
}

/** Les valeurs dont le texte n'est pas un nombre — celles qui bloquent l'enregistrement. */
export function unreadable(values: CorrectionValues): Macro[] {
  return NUTRIENTS.filter(
    ({ key, inputMode }) => readField(values[key], inputMode === 'numeric') === undefined,
  ).map(({ key }) => key);
}

/**
 * La requête de correction, ou `null` si un champ est illisible.
 *
 * **Les cinq valeurs partent toujours**, y compris à `null` : c'est ce qui permet d'effacer
 * des fibres fausses, et c'est la seule forme où le serveur applique les deux dernières
 * plutôt que de les préserver. `source` ne part pas : corriger une estimation ne la
 * transforme pas en saisie (`NUT-09`).
 */
export function correctionPayload(values: CorrectionValues): MealUpdate | null {
  if (unreadable(values).length > 0) return null;

  const payload: MealUpdate = {
    meal_type: values.meal_type,
    comment: values.comment.trim() === '' ? null : values.comment.trim(),
  };
  for (const { key, inputMode } of NUTRIENTS) {
    payload[key] = readField(values[key], inputMode === 'numeric') ?? null;
  }
  return payload;
}
