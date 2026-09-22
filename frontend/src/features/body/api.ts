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

export interface MeasurementIndicator {
  field: string;
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

/** FC de repos et VFC d'un matin, lues sur la montre (`docs/coach-course.md`, **C3**). */
export interface MorningEntry {
  id: number;
  token: string;
  date: string;
  resting_hr: number | null;
  hrv_ms: number | null;
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
  readiness: Readiness;
  recent: MorningEntry[];
}

export interface MorningPayload {
  date: string;
  resting_hr: number | null;
  hrv_ms: number | null;
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

  deleteMeasurement: (id: number, token: string) =>
    request<undefined>(`/api/body/measurements/${id}`, {
      method: 'DELETE',
      headers: guard(token),
    }),
};
