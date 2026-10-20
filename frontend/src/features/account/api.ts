/**
 * Sécurité et données (`docs/exploitation-securite.md`) : les passkeys, l'usage IA du mois,
 * la dernière sauvegarde. Des types et des appels, aucun calcul.
 */

import { request, type SessionResponse } from '@/lib/api';

export interface UsageView {
  month: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  budget_usd: number;
  share: number | null;
  text: string;
}

export interface AccountView {
  today: string;
  usage: UsageView;
  backup: { last: string | null; daily: boolean; text: string };
}

export interface PasskeyItem {
  id: string;
  name: string;
  created: string;
  created_text: string;
  token: string;
}

export interface PasskeyList {
  configured: boolean;
  items: PasskeyItem[];
}

type Json = Record<string, unknown>;

export const accountApi = {
  view: () => request<AccountView>('/api/account'),
};

export const passkeyApi = {
  list: () => request<PasskeyList>('/api/passkey'),
  registerOptions: () => request<Json>('/api/passkey/register/options', { method: 'POST' }),
  register: (credential: Json, name: string) =>
    request<PasskeyList>('/api/passkey/register', {
      method: 'POST',
      body: { credential, name },
    }),
  remove: (id: string, token: string) =>
    request<PasskeyList>(`/api/passkey/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'If-Match': token },
    }),
  available: () => request<{ available: boolean }>('/api/auth/passkey', { anonymous: true }),
  loginOptions: () =>
    request<Json>('/api/auth/passkey/options', { method: 'POST', anonymous: true }),
  login: (credential: Json) =>
    request<SessionResponse>('/api/auth/passkey', {
      method: 'POST',
      body: { credential },
      anonymous: true,
    }),
};
