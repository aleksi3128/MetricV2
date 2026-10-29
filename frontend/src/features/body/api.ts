/**
 * Accès au domaine Corps (`BODY-01` → `BODY-10`).
 *
 * Les types reflètent exactement les schémas du serveur. Aucun calcul ici : indicateurs,
 * tendance et écarts arrivent déjà calculés — c'est la règle du projet.
 */

import { request } from '@/lib/api';

export interface WeightEntry {
  id: number;
  /** À renvoyer en `If-Match` pour corriger ou supprimer (`STO-05`). */
  token: string;
  date: string;
  weight_kg: number;
  note: string | null;
  source: string;
}

export interface WeightPoint {
  date: string;
  weight_kg: number;
  trend_kg: number | null;
}

export interface WeightStats {
  latest_kg: number | null;
  latest_date: string | null;
  change_kg: number | null;
  /** Sur combien de pesées la variation est mesurée — `null` sans variation. */
  change_count: number | null;
  change_since: string | null;
  to_target_kg: number | null;
  target_kg: number;
  min_kg: number | null;
  max_kg: number | null;
  amplitude_kg: number | null;
  count: number;
}

export interface WeightView {
  /** Le jour courant selon le serveur. Le formulaire ne le devine pas. */
  today: string;
  stats: WeightStats;
  series: WeightPoint[];
  entries: WeightEntry[];
  total: number;
}

export interface WeightPayload {
  date: string;
  weight_kg: number;
  note?: string | null;
}

export interface MeasurementEntry {
  id: number;
  token: string;
  date: string;
  waist_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  hips_cm: number | null;
  thigh_cm: number | null;
  body_fat_pct: number | null;
  note: string | null;
}

/**
 * Les six mesures, dans l'ordre de `MEASUREMENT_FIELDS` côté serveur. Ce sont aussi les
 * clés de leurs séries dans `GET /api/aggregates/series` — c'est ce qui permet à la
 * courbe de `/corps` de les demander sans table de correspondance.
 */
export type MeasureField =
  'waist_cm' | 'chest_cm' | 'arm_cm' | 'hips_cm' | 'thigh_cm' | 'body_fat_pct';

export interface MeasurementIndicator {
  field: MeasureField;
  label: string;
  latest: number | null;
  latest_date: string | null;
  delta: number | null;
  direction: 'up' | 'down' | 'flat' | null;
  unit: string;
}

export interface MeasurementView {
  /** Même raison que sur `WeightView` : le jour d'un relevé vient du serveur. */
  today: string;
  indicators: MeasurementIndicator[];
  entries: MeasurementEntry[];
  total: number;
}

export interface MeasurementPayload {
  date: string;
  waist_cm?: number | null;
  chest_cm?: number | null;
  arm_cm?: number | null;
  hips_cm?: number | null;
  thigh_cm?: number | null;
  body_fat_pct?: number | null;
  note?: string | null;
}

/** L'en-tête qui porte la garde anti-conflit. */
function guard(token: string): Record<string, string> {
  return { 'If-Match': token };
}

/**
 * FC de repos, VFC et durée du sommeil d'un matin, lues sur la montre
 * (`docs/coach-course.md`, **C3** ; `docs/synchro-garmin.md` §6).
 */
export interface MorningEntry {
  id: number;
  token: string;
  date: string;
  resting_hr: number | null;
  hrv_ms: number | null;
  /** La durée en minutes, et sa décomposition servie : le formulaire se rouvre sans calcul. */
  sleep_min: number | null;
  sleep_hours: number | null;
  sleep_minutes: number | null;
  source: string;
}

/**
 * La forme d'un matin contre la référence personnelle. `text` est rédigé par le serveur ;
 * `status` ne décide qu'un ton à l'écran.
 */
export interface Readiness {
  status: 'unknown' | 'normal' | 'lighten' | 'rest';
  text: string;
  resting_hr: number | null;
  hrv_ms: number | null;
  rhr_baseline: number | null;
  rhr_delta: number | null;
  hrv_baseline: number | null;
  hrv_low: number | null;
  hrv_high: number | null;
  mornings: number;
  needed: number;
}

export interface MorningView {
  /** Le jour du serveur — la saisie se date avec lui, jamais avec l'horloge du téléphone. */
  today: string;
  entry: MorningEntry | null;
  /** Le dernier matin avant aujourd'hui, **rappelé** — jamais prérempli, jamais proposé. */
  previous: MorningEntry | null;
  readiness: Readiness;
  recent: MorningEntry[];
}

export interface MorningPoint {
  date: string;
  value: number;
}

/**
 * Une mesure du matin sur trente jours (M-09). `reference_line` — la référence de chaque
 * point — n'est servie que lorsque chacun a la sienne : `null` pendant qu'elle se
 * construit, et `text` dit ce qu'il manque.
 */
export interface MorningSeries {
  key: 'resting_hr' | 'hrv_ms';
  label: string;
  unit: string;
  points: MorningPoint[];
  reference_line: number[] | null;
  reference: number | null;
  needed: number;
  text: string;
}

export interface MorningTrend {
  /** Le jour du serveur : une correction ne se date pas au-delà. */
  today: string;
  since: string;
  days: number;
  series: MorningSeries[];
  /** Les matins de la fenêtre, du plus récent au plus ancien. */
  entries: MorningEntry[];
}

/**
 * Le corps **remplace la ligne** : chaque champ est requis, `null` compris. Une durée
 * omise effacerait le sommeil en corrigeant une FC — le type ne le laisse pas oublier.
 * Heures et minutes partent telles quelles : le serveur compose la durée.
 */
export interface MorningPayload {
  date: string;
  resting_hr: number | null;
  hrv_ms: number | null;
  sleep_hours: number | null;
  sleep_minutes: number | null;
}

export const bodyApi = {
  morning: () => request<MorningView>('/api/body/morning'),
  createMorning: (payload: MorningPayload) =>
    request<MorningEntry>('/api/body/morning', { method: 'POST', body: payload }),
  updateMorning: (id: number, token: string, payload: MorningPayload) =>
    request<MorningEntry>(`/api/body/morning/${id}`, {
      method: 'PATCH',
      headers: guard(token),
      body: payload,
    }),
  morningTrend: () => request<MorningTrend>('/api/body/morning/trend'),
  deleteMorning: (id: number, token: string) =>
    request<undefined>(`/api/body/morning/${id}`, { method: 'DELETE', headers: guard(token) }),
  weight: (limit = 50) => request<WeightView>('/api/body/weight', { query: { limit } }),

  createWeight: (payload: WeightPayload) =>
    request<WeightEntry>('/api/body/weight', { method: 'POST', body: payload }),

  updateWeight: (id: number, token: string, payload: WeightPayload) =>
    request<WeightEntry>(`/api/body/weight/${id}`, {
      method: 'PATCH',
      body: payload,
      headers: guard(token),
    }),

  deleteWeight: (id: number, token: string) =>
    request<undefined>(`/api/body/weight/${id}`, { method: 'DELETE', headers: guard(token) }),

  measurements: (limit = 50) =>
    request<MeasurementView>('/api/body/measurements', { query: { limit } }),

  createMeasurement: (payload: MeasurementPayload) =>
    request<MeasurementEntry>('/api/body/measurements', { method: 'POST', body: payload }),

  /**
   * Corrige un relevé **en entier** : le serveur remplace la ligne. Une mesure absente du
   * corps est effacée — c'est ainsi qu'une valeur tapée dans la mauvaise case se retire.
   */
  updateMeasurement: (id: number, token: string, payload: MeasurementPayload) =>
    request<MeasurementEntry>(`/api/body/measurements/${id}`, {
      method: 'PATCH',
      body: payload,
      headers: guard(token),
    }),

  deleteMeasurement: (id: number, token: string) =>
    request<undefined>(`/api/body/measurements/${id}`, {
      method: 'DELETE',
      headers: guard(token),
    }),
};
