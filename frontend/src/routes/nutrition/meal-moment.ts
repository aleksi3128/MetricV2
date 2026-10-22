/**
 * Quand un repas a eu lieu, dans les mots de l'écran — et seulement ce qu'on en sait.
 *
 * Un repas rattrapé la veille porte l'heure **type** de son repas, posée par le serveur
 * (M-01) : 20:00 pour un dîner. L'afficher en ferait une heure relevée, ce que
 * l'invariant « aucune valeur inventée » interdit. Le serveur le dit (`time_recorded`) et
 * nomme le jour (`day_label`) ; ce module choisit la phrase, il ne calcule rien.
 */

import { longDate, time } from '@/lib/format';

import type { Meal } from '@/features/nutrition/api';

/** `12:30`, ou `heure non relevée`. */
export function mealTime(meal: Meal): string {
  return meal.time_recorded ? time(meal.datetime) : 'heure non relevée';
}

/** Le titre de la fiche : `Repas de 12:30`, ou `Hier, heure non relevée`. */
export function mealTitle(meal: Meal): string {
  if (meal.time_recorded) return `Repas de ${time(meal.datetime)}`;
  // Au-delà des deux jours servis, le serveur ne nomme plus le jour : la date l'écrit.
  return `${meal.day_label ?? longDate(meal.datetime)}, heure non relevée`;
}
