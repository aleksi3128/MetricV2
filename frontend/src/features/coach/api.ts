/**
 * Le coach de course (`docs/coach-course.md` §7).
 *
 * Deux natures de texte, et les types les séparent : `rationale` est **écrit par le
 * modèle** quand `source` vaut `model` — l'écran le pose dans `AiBlock`, nulle part
 * ailleurs —, tandis que `frame`, `adjusted` et chaque `target` sortent de règles fixes.
 * Aucun calcul ici : cibles, durées et bornes arrivent calculées.
 */

import { request } from '@/lib/api';

export type SessionType =
  | 'rest'
  | 'recovery'
  | 'easy'
  | 'long'
  | 'progressive'
  | 'tempo'
  | 'threshold'
  | 'intervals'
  | 'hills'
  | 'test';

export interface CoachStep {
  kind: 'warmup' | 'run' | 'recover' | 'cooldown';
  label: string;
  duration_s: number | null;
  distance_m: number | null;
  /** La cible, déjà écrite — « sous 141 bpm ». */
  target: string | null;
  hr_low: number | null;
  hr_high: number | null;
  pace_slow_min_km: number | null;
  pace_fast_min_km: number | null;
  repeat: number | null;
}

export interface CoachView {
  id: string;
  status: 'proposed' | 'accepted' | 'refused' | 'done' | 'replaced';
  date: string;
  time: string | null;
  type: SessionType;
  title: string;
  duration_min: number;
  source: 'model' | 'rules';
  rationale: string;
  steps: CoachStep[];
  /** Les règles qui ont borné le choix, en phrases. */
  frame: string[];
  /** L'allègement du matin, quand la forme l'a demandé — une règle, pas le modèle. */
  adjusted: string | null;
  /** Vrai quand un fichier d'entraînement pour la montre existe (**C9**). */
  workout: boolean;
  plan_session_id: string | null;
  /** La sortie dont l'import a fait naître la proposition. */
  trigger_run_id: string | null;
}

export interface CoachNext {
  /** La proposition active, ou `null` — et `missing` dit ce que coûte la suivante. */
  current: CoachView | null;
  missing: string | null;
  /** Vrai pendant qu'une proposition se prépare, juste après un import. */
  pending: boolean;
}

export interface AcceptPayload {
  date?: string | undefined;
  time?: string | null | undefined;
}

export const coachApi = {
  next: () => request<CoachNext>('/api/coach/next'),
  refresh: () => request<CoachNext>('/api/coach/next/refresh', { method: 'POST' }),
  accept: (payload: AcceptPayload = {}) =>
    request<CoachNext>('/api/coach/next/accept', { method: 'POST', body: payload }),
  refuse: () => request<CoachNext>('/api/coach/next/refuse', { method: 'POST' }),
  /** L'adresse du fichier d'entraînement — téléchargé par `useWorkoutDownload`. */
  workoutPath: '/api/coach/next/workout.fit',
};
