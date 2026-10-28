/**
 * La charge tous sports et la nuit (`docs/charge-multisport.md`, `docs/accueil-et-charge.md`).
 *
 * Des types et des appels, aucun calcul : la forme, la part du facile, la longueur d'une
 * barre et chaque phrase sont rendues par le serveur.
 */

import { request } from '@/lib/api';

export interface LoadPoint {
  date: string;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
  /** La douleur la plus forte notée ce jour-là, sur 10 ; `null` : rien de noté. */
  pain: number | null;
}

export interface LoadWeek {
  start: string;
  minutes: Record<string, number>;
  load: number;
  total_min: number;
  share: number;
  total_text: string;
  sports_text: string;
}

export interface IntensityView {
  easy: number | null;
  moderate: number | null;
  hard: number | null;
  /** Les trois parts en pourcentages entiers qui font 100 (plus grand reste, au serveur). */
  easy_pct: number | null;
  moderate_pct: number | null;
  hard_pct: number | null;
  target: number;
  unclassified_min: number;
  text: string;
}

export interface Finding {
  key: string;
  kind: string;
  priority: 'critical' | 'normal' | 'info';
  title: string;
  text: string;
}

export interface TrainingView {
  today: string;
  history_days: number;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  /** Forme, fatigue, fraîcheur arrondies une fois au serveur : ce que `form_text` écrit. */
  form: number | null;
  fatigue: number | null;
  freshness: number | null;
  form_text: string;
  ratio: number | null;
  ratio_text: string;
  monotony: number | null;
  strain: number | null;
  monotony_text: string;
  unrated: Record<string, number>;
  unrated_text: string;
  series: LoadPoint[];
  weeks: LoadWeek[];
  findings: Finding[];
  intensity: IntensityView | null;
  pain_stop: number;
  /** Bornes communes de la forme et de la fatigue, tracées sur le même axe. */
  load_domain: [number, number] | null;
}

export interface HealthDay {
  date: string;
  sleep_min: number | null;
  sleep_score: number | null;
  stress_avg: number | null;
  body_battery_high: number | null;
  body_battery_low: number | null;
  text: string;
}

export interface HealthView {
  days: HealthDay[];
}

export const trainingApi = {
  view: () => request<TrainingView>('/api/training'),
  health: () => request<HealthView>('/api/body/health'),
};
