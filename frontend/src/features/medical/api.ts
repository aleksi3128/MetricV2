/**
 * Le dossier médical (`docs/dossier-medical.md`). Il voyage en clair entre le serveur et
 * l'écran seulement : sur Nextcloud, chaque entrée est scellée.
 */

import { request } from '@/lib/api';

export type MedicalKind =
  'profil' | 'semelles' | 'praticien' | 'consultation' | 'opération' | 'antécédent' | 'traitement';

export interface MedicalEntry {
  id: number;
  token: string;
  entry_id: string;
  kind: MedicalKind;
  date: string | null;
  title: string;
  details: string;
  practitioner: string;
}

export interface MedicalView {
  today: string;
  entries: MedicalEntry[];
}

export interface MedicalPayload {
  kind: MedicalKind;
  date: string | null;
  title: string;
  details: string;
  practitioner: string;
}

export interface MedicalProposal {
  kind: MedicalKind | null;
  date: string | null;
  title: string | null;
  details: string | null;
  practitioner: string | null;
  /** « J'ai rangé : … », rédigé par le serveur. */
  summary: string;
}

export const medicalApi = {
  view: () => request<MedicalView>('/api/medical'),
  create: (payload: MedicalPayload) =>
    request<MedicalView>('/api/medical', { method: 'POST', body: payload }),
  update: (id: number, token: string, payload: MedicalPayload) =>
    request<MedicalView>(`/api/medical/${String(id)}`, {
      method: 'PATCH',
      headers: { 'If-Match': token },
      body: payload,
    }),
  remove: (id: number, token: string) =>
    request<MedicalView>(`/api/medical/${String(id)}`, {
      method: 'DELETE',
      headers: { 'If-Match': token },
    }),
  parse: (text: string) =>
    request<MedicalProposal>('/api/medical/parse', { method: 'POST', body: { text } }),
};
