/**
 * Les courses visées et leur plan (`docs/plan-course.md`).
 *
 * Le plan, les conflits et leurs phrases viennent du serveur, calculés par règles :
 * l'écran ne compte aucune semaine et ne décide d'aucune priorité.
 */

import { request } from '@/lib/api';

export type Distance =
  '5k' | '10k' | 'semi' | 'marathon' | 'sprint' | 'olympique' | '70.3' | 'ironman';
export type Priority = 'A' | 'B' | 'C';
export type Phase =
  'base' | 'développement' | 'spécifique' | 'récupération' | 'affûtage' | 'course';

export interface Race {
  id: number;
  token: string;
  race_id: string;
  name: string;
  date: string;
  distance: Distance;
  distance_label: string;
  priority: Priority;
  target: string | null;
  note: string | null;
  countdown: string;
  past: boolean;
}

export interface Conflict {
  key: string;
  keep: string;
  demote: string;
  text: string;
}

export interface RaceList {
  today: string;
  races: Race[];
  conflicts: Conflict[];
  next_a: string | null;
}

export interface RacePayload {
  name: string;
  date: string;
  distance: Distance;
  priority: Priority;
  target?: string | null;
  note?: string | null;
}

export interface PlanSession {
  date: string;
  weekday: string;
  title: string;
  notation: string;
  minutes: number;
  km: number | null;
  race: boolean;
}

export interface PlanWeek {
  start: string;
  phase: Phase;
  km: number;
  long_km: number;
  sessions: PlanSession[];
}

export interface PlanView {
  race_id: string;
  summary: string;
  warnings: string[];
  weeks: PlanWeek[];
  placed: number;
}

export interface Placed {
  created: number;
  removed: number;
}

export const racesApi = {
  list: () => request<RaceList>('/api/races'),
  create: (payload: RacePayload) =>
    request<RaceList>('/api/races', { method: 'POST', body: payload }),
  remove: (id: number, token: string) =>
    request<RaceList>(`/api/races/${String(id)}`, {
      method: 'DELETE',
      headers: { 'If-Match': token },
    }),
  decide: (key: string, accept: boolean) =>
    request<RaceList>(`/api/races/conflicts/${encodeURIComponent(key)}`, {
      method: 'POST',
      body: { accept },
    }),
  plan: (raceId: string) => request<PlanView>(`/api/races/plan/${raceId}`),
  place: (raceId: string) => request<Placed>(`/api/races/plan/${raceId}`, { method: 'POST' }),
  clear: () => request<Placed>('/api/races/plan', { method: 'DELETE' }),
};
