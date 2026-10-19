/**
 * Accès aux douleurs (`docs/douleurs.md`).
 *
 * Les types reflètent exactement les schémas du serveur. L'état d'un épisode — adapté,
 * arrêt, refermé — et sa phrase arrivent jugés : la réponse graduée est une règle du
 * serveur, et l'écran ne la recalcule jamais.
 */

import { request } from '@/lib/api';

export type PainSide = 'left' | 'right' | 'both' | 'na';
export type PainMoment = 'during' | 'after' | 'next_day' | 'rest';
export type PainKind = 'dull' | 'sharp' | 'pulling' | 'burning' | 'stiff' | 'other';
export type PainSource = 'import' | 'morning' | 'manual';
export type PainStatus = 'adapt' | 'stop' | 'closed';

export interface PainEntry {
  id: number;
  /** À renvoyer en `If-Match` pour supprimer (`STO-05`). */
  token: string;
  pain_id: string;
  date: string;
  report: 'pain' | 'none';
  zone: string;
  side: PainSide;
  intensity: number;
  baseline: number | null;
  moment: PainMoment;
  kind: PainKind;
  limp: boolean;
  run_id: string | null;
  note: string | null;
  source: PainSource;
  /** « 3/10 · après · sourde », rédigé par le serveur. */
  summary: string;
}

export interface PainEpisode {
  pain_id: string;
  zone: string;
  side: PainSide;
  /** « (Achille, droit) », rédigé par le serveur. */
  place: string;
  /** « Achille · droit », pour un titre. */
  title: string;
  baseline: number;
  opened: string;
  last_intensity: number;
  last_date: string;
  status: PainStatus;
  /** La réponse graduée, à afficher telle quelle. */
  text: string;
  closed_on: string | null;
  due_today: boolean;
  reports: PainEntry[];
}

export interface PainView {
  today: string;
  open: PainEpisode[];
  closed: PainEpisode[];
  none: PainEntry[];
  zones: string[];
  /** Dernière base notée par zone, clé en minuscules — rappelée, jamais préremplie. */
  baselines: Record<string, number>;
}

export interface PainPayload {
  date: string;
  /** Absent : le relevé ouvre un épisode. Présent : c'est un suivi. */
  pain_id?: string | null;
  intensity: number;
  moment: PainMoment;
  kind: PainKind;
  limp?: boolean;
  zone?: string | null;
  side?: PainSide | null;
  baseline?: number | null;
  run_id?: string | null;
  note?: string | null;
  source?: PainSource;
}

export const painApi = {
  view: () => request<PainView>('/api/pain'),
  create: (payload: PainPayload) =>
    request<PainEpisode>('/api/pain', { method: 'POST', body: payload }),
  none: (date: string, runId: string) =>
    request<PainEntry>('/api/pain/none', { method: 'POST', body: { date, run_id: runId } }),
  remove: (id: number, token: string) =>
    request<undefined>(`/api/pain/${String(id)}`, {
      method: 'DELETE',
      headers: { 'If-Match': token },
    }),
};
