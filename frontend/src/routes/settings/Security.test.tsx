/**
 * Sécurité et données (`docs/exploitation-securite.md`).
 *
 * Fermée, la passkey le dit et n'offre rien ; ouverte, ses clés se retirent par `SwipeRow`
 * sous `If-Match`. L'usage et la sauvegarde sont des phrases du serveur, recopiées.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { AccountView, PasskeyList } from '@/features/account/api';
import { createQueryClient } from '@/lib/query';

import { Security } from './Security';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const ACCOUNT: AccountView = {
  today: '2026-10-20',
  usage: {
    month: '2026-10',
    calls: 12,
    prompt_tokens: 4000,
    completion_tokens: 900,
    cost_usd: 0,
    budget_usd: 5,
    share: 0,
    text: '12 appels au modèle ce mois-ci : 0,00 $ sur un plafond de 5,00 $.',
  },
  backup: { last: null, daily: false, text: 'Aucune sauvegarde encore.' },
};

let passkeys: PasskeyList = { configured: false, items: [] };
const sent: { url: string; method: string; headers: unknown }[] = [];

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      const method = init?.method ?? 'GET';
      if (method !== 'GET') sent.push({ url, method, headers: init?.headers });
      if (url.includes('/api/account')) return Promise.resolve(json(200, ACCOUNT));
      if (method === 'DELETE') return Promise.resolve(json(200, { ...passkeys, items: [] }));
      return Promise.resolve(json(200, passkeys));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderSecurity() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>
          <Security />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('sécurité et données', () => {
  it('fermée sans configuration, la passkey le dit et n’offre aucun ajout', async () => {
    renderSecurity();
    expect(
      await screen.findByText(/PASSKEY_RP_ID et PASSKEY_ORIGIN sont vides/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter une passkey' })).not.toBeInTheDocument();
  });

  it('recopie l’usage et la sauvegarde, et offre l’export', async () => {
    renderSecurity();
    expect(await screen.findByText(ACCOUNT.usage.text)).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT.backup.text)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exporter mes données' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /supprimer tout|tout supprimer/i })).toBeNull();
  });

  it('retire une passkey en deux appuis, sous If-Match', async () => {
    passkeys = {
      configured: true,
      items: [
        {
          id: 'abc',
          name: 'iPhone',
          created: '2026-10-20T09:00',
          created_text: 'ajoutée le 20/10/2026',
          token: 'tk1',
        },
      ],
    };
    renderSecurity();
    expect(await screen.findByText('ajoutée le 20/10/2026')).toBeInTheDocument();

    const remove = screen.getByRole('button', { name: 'Retirer « iPhone »' });
    await userEvent.click(remove);
    expect(sent).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: /Retirer « iPhone »/ }));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('DELETE');
    expect(sent[0]?.url).toBe('/api/passkey/abc');
    expect(sent[0]?.headers).toEqual({ 'If-Match': 'tk1' });
  });
});
