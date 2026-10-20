/**
 * Le point du soir (`docs/notifications-v3.md`).
 *
 * Le serveur décide de tout ce qui porte une heure : si le point est dû, ce qu'il montre,
 * ce que dit la journée. L'écran affiche et transmet les réponses.
 */

import type { PlanChange } from '@/features/planning/api';
import { request } from '@/lib/api';

export interface DebriefItem {
  kind: 'run' | 'swim' | 'other';
  id: number;
  token: string;
  activity_id: string;
  label: string;
  /** « 52 min · 8,2 km », rédigé par le serveur. */
  detail: string;
  rpe: number | null;
}

export interface PainQuestion {
  date: string;
  activity_id: string;
  label: string;
}

export interface EveningFlow {
  today: string;
  due: boolean;
  window_open: boolean;
  done: boolean;
  snoozed_until: string | null;
  snooze_min: number;
  summary: string;
  debrief: DebriefItem[];
  pain: PainQuestion | null;
  tomorrow_lines: string[];
  /** Ce que le coach a changé et qui attend un oui ou un non (PLN-04). */
  changes: PlanChange[];
}

export const eveningApi = {
  flow: () => request<EveningFlow>('/api/evening'),
  done: () => request<EveningFlow>('/api/evening/done', { method: 'POST' }),
  snooze: () => request<EveningFlow>('/api/evening/snooze', { method: 'POST', body: {} }),
};
