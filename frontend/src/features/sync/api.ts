/** La synchro Garmin (`docs/synchro-garmin.md`). L'état vient du serveur, en mots. */

import { request } from '@/lib/api';

export interface SyncView {
  available: boolean;
  /** Ce qui manque, ou le rythme — à afficher tel quel. */
  message: string;
  last_success: string | null;
  /** « le 20/10 à 09:00 », rédigé par le serveur. */
  last_success_text: string | null;
  last_error: string | null;
  imported: number;
}

export interface SyncRun {
  received: string[];
  health_days: number;
  error: string | null;
}

export const syncApi = {
  read: () => request<SyncView>('/api/sync'),
  run: () => request<SyncRun>('/api/sync', { method: 'POST' }),
};
