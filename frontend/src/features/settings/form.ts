/**
 * Le brouillon d'un formulaire de réglages, et ce qu'il envoie.
 *
 * Il servait un seul écran, `/reglages`, qui portait toutes les clés de `settings.csv`.
 * Depuis M-04 (`docs/pages/modifications.md`), chaque réglage vit à côté de l'écran qu'il
 * règle — la cible d'eau sur `/routine`, les repères sur `/activite/courses`, l'adresse de
 * Cadence sur `/activite/seances` — et chaque formulaire n'envoie **que ses propres clés**.
 * D'où le paramètre `fields` : un formulaire qui comparerait toutes les clés enverrait
 * celles d'un autre écran au premier écart de formatage.
 *
 * Aucune valeur de repli n'est écrite ici : les défauts viennent du serveur.
 */

import { pace } from '@/lib/format';

import type { SettingsPayload, SettingsValues } from './api';

export type SettingsKey = keyof SettingsValues;

/** Champs saisis, sous leur forme texte — un formulaire ne manipule que des chaînes. */
export type SettingsDraft = Record<SettingsKey, string>;

export function toDraft(values: SettingsValues): SettingsDraft {
  return {
    target_weight_kg: String(values.target_weight_kg),
    target_protein_g: String(values.target_protein_g),
    max_added_sugar_g: String(values.max_added_sugar_g),
    target_calories: String(values.target_calories),
    target_hydration_ml: String(values.target_hydration_ml),
    hydration_presets_ml: values.hydration_presets_ml.join(', '),
    heatmap_metric: values.heatmap_metric,
    cadence_base_url: values.cadence_base_url,
    // Vides quand rien n'est saisi : c'est la déduction, et le champ le montre tel quel
    // plutôt que d'y écrire une valeur que personne n'a choisie.
    max_hr: values.max_hr == null ? '' : String(values.max_hr),
    threshold_pace_min_km:
      values.threshold_pace_min_km == null ? '' : pace(values.threshold_pace_min_km),
  };
}

/**
 * Ce que le formulaire envoie : **seulement ce qui a changé**, parmi `fields`.
 *
 * L'API accepte une modification partielle, et lui envoyer toutes les clés écrirait des
 * valeurs de repli dans le fichier — un objectif jamais choisi deviendrait un objectif
 * choisi, et il cesserait de suivre le défaut si celui-ci évoluait.
 */
export function changes(
  draft: SettingsDraft,
  current: SettingsValues,
  fields: readonly SettingsKey[],
): SettingsPayload {
  const before = toDraft(current);
  const payload: SettingsPayload = {};

  for (const key of fields) {
    switch (key) {
      case 'target_weight_kg':
      case 'target_protein_g':
      case 'max_added_sugar_g':
      case 'target_calories':
      case 'target_hydration_ml': {
        if (draft[key] === before[key]) break;
        const parsed = Number.parseFloat(draft[key].replace(',', '.'));
        // Le serveur porte les bornes de vraisemblance (`API-06`) : le client n'en
        // redéclare aucune, il transmet et affiche le refus.
        if (Number.isFinite(parsed)) payload[key] = parsed;
        break;
      }

      case 'hydration_presets_ml':
        if (draft[key] === before[key]) break;
        payload[key] = draft[key]
          .split(',')
          .map((chunk) => Number.parseInt(chunk.trim(), 10))
          .filter((value) => Number.isFinite(value));
        break;

      case 'heatmap_metric':
        if (draft[key] !== before[key]) payload[key] = draft[key];
        break;

      /*
       * L'adresse de Cadence et les deux références de course : **la chaîne vide part au
       * serveur**. Ailleurs, un champ vidé serait une saisie en cours et le laisser filer
       * écraserait un objectif par rien. Ici, vide *est* la valeur — « pas d'adresse », « la
       * référence se déduit » — et c'est la seule façon d'effacer un réglage qui n'a aucun
       * défaut sur lequel retomber. Les références partent en texte : `5:15` se lit côté
       * serveur comme une allure saisie au clavier.
       */
      case 'cadence_base_url':
      case 'max_hr':
      case 'threshold_pace_min_km':
        if (draft[key].trim() !== before[key]) payload[key] = draft[key].trim();
        break;
    }
  }

  return payload;
}
