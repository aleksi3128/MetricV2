/**
 * Le parcours du matin (`docs/coach-course.md` §5).
 *
 * Le serveur décide de tout ce qui porte une heure ou un ordre : si la feuille est due,
 * par où reprendre, ce qui est fait. L'écran affiche l'étape qu'on lui désigne.
 */

import type { Run } from '@/features/activity/api';
import type { MorningView, WeightEntry } from '@/features/body/api';
import type { CoachView } from '@/features/coach/api';
import type { PlannedSession } from '@/features/planning/api';
import type { ChecklistItem } from '@/features/routine/api';
import { request } from '@/lib/api';

export type StepKey = 'night' | 'weight' | 'session' | 'day';

export interface FlowStep {
  key: StepKey;
  title: string;
  done: boolean;
}

export interface MorningFlow {
  today: string;
  due: boolean;
  window_open: boolean;
  snoozed: boolean;
  resume: StepKey | null;
  steps: FlowStep[];
  night: MorningView;
  weight: { today: WeightEntry | null; last: WeightEntry | null };
  session: { planned: PlannedSession[]; coach: CoachView | null };
  day: {
    unrated_runs: Run[];
    meals_yesterday: number;
    supplements: ChecklistItem[];
    planned: PlannedSession[];
  };
}

export const morningApi = {
  flow: () => request<MorningFlow>('/api/morning'),
  pass: (step: StepKey) =>
    request<MorningFlow>('/api/morning/pass', { method: 'POST', body: { step } }),
  snooze: () => request<MorningFlow>('/api/morning/snooze', { method: 'POST' }),
};
