/**
 * Accès aux réglages (`L08-01`, `L08-02`).
 *
 * **Aucune valeur de repli n'est écrite ici.** Le serveur envoie les défauts avec les
 * valeurs effectives ; les recopier dans ce fichier créerait une seconde source de
 * vérité, et le jour où l'objectif de protéines changerait côté backend, l'écran
 * afficherait encore l'ancien pour un utilisateur qui n'a jamais rien réglé.
 */

import { request } from '@/lib/api';

export interface SettingsValues {
  target_weight_kg: number;
  target_protein_g: number;
  max_added_sugar_g: number;
  target_calories: number;
  target_hydration_ml: number;
  hydration_presets_ml: number[];
  heatmap_metric: string;
  /**
   * Adresse de Cadence Tabata, l'application qui exécute les séances.
   *
   * **La chaîne vide est un état, pas une absence** : le pont est en sommeil, et l'écran
   * le dit. Aucun domaine n'est deviné côté client — c'est le serveur qui sert cette
   * valeur, et lui seul qui décide qu'une adresse abîmée n'en est pas une.
   */
  cadence_base_url: string;
  /**
   * Les deux références des zones de course (`docs/analyse-course.md`, **A9**).
   *
   * `null` **est un état** : la référence est alors déduite des sorties, et la page Course
   * dit d'où. L'écran n'en devine aucune.
   */
  max_hr: number | null;
  threshold_pace_min_km: number | null;
}

export interface SettingsView {
  values: SettingsValues;
  /** Ce que vaut chaque réglage non renseigné, servi par le serveur. */
  defaults: SettingsValues;
  /** Clés effectivement présentes dans le fichier : le reste est un repli, pas un choix. */
  stored: (keyof SettingsValues)[];
  /** À renvoyer en « If-Match » pour modifier (`STO-05`). */
  token: string;
}

/**
 * Modification partielle : un champ omis reste à sa valeur.
 *
 * Les deux références de course partent en **texte** — `5:15` se lit côté serveur comme
 * une allure saisie au clavier —, et la chaîne vide les efface pour revenir à la déduction.
 */
export type SettingsPayload = Partial<
  Omit<SettingsValues, 'max_hr' | 'threshold_pace_min_km'> & {
    max_hr: string;
    threshold_pace_min_km: string;
  }
>;

export const settingsApi = {
  read: () => request<SettingsView>('/api/settings'),

  update: (payload: SettingsPayload, token: string) =>
    request<SettingsView>('/api/settings', {
      method: 'PATCH',
      body: payload,
      headers: { 'If-Match': token },
    }),
};
