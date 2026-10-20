/**
 * Le dossier médical à l'écran (`docs/dossier-medical.md`).
 *
 * Sans clé, l'écran recopie la phrase du serveur et n'offre aucune saisie : rien ne
 * s'écrirait en clair. Avec, il range par nature, ne choisit aucune nature à la place de
 * l'utilisateur, et corrige sous `If-Match`.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { MedicalEntry, MedicalView } from '@/features/medical/api';
import { createQueryClient } from '@/lib/query';

import { Dossier } from './Dossier';

const sent: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const PROFILE: MedicalEntry = {
  id: 0,
  token: 't0',
  entry_id: 'm1',
  kind: 'profil',
  date: null,
  title: 'Pied hyperlaxe',
  details: '',
  practitioner: '',
};

const VISIT: MedicalEntry = {
  id: 1,
  token: 't1',
  entry_id: 'm2',
  kind: 'consultation',
  date: '2026-06-12',
  title: 'Bilan podologique',
  details: 'Semelles sur mesure.',
  practitioner: 'Dr Martin',
};

let current: MedicalView | null = { today: '2026-10-20', entries: [] };

beforeEach(() => {
  sent.length = 0;
  current = { today: '2026-10-20', entries: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      const method = init?.method ?? 'GET';
      if (url.endsWith('/api/ai/status')) return Promise.resolve(json(200, { enabled: false }));
      if (current === null) {
        return Promise.resolve(
          json(503, {
            code: 'medical_not_configured',
            message: 'Le dossier médical est fermé : ajoute MEDICAL_KEY.',
          }),
        );
      }
      if (method !== 'GET') {
        sent.push({
          url,
          method,
          headers: (init?.headers ?? {}) as Record<string, string>,
          body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
        });
      }
      return Promise.resolve(json(method === 'POST' ? 201 : 200, current));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDossier() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>
          <Dossier />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('le dossier médical', () => {
  it('fermé sans clé : recopie la phrase du serveur, et n’offre aucune saisie', async () => {
    current = null;
    renderDossier();

    expect(await screen.findByText(/ajoute MEDICAL_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter une entrée' })).not.toBeInTheDocument();
  });

  it('ne choisit aucune nature, et dit ce qui manque avant d’écrire', async () => {
    renderDossier();
    expect(await screen.findByText('Dossier vide')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une entrée' }));

    const kinds = within(screen.getByRole('group', { name: 'Nature' })).getAllByRole('button');
    expect(kinds.filter((chip) => chip.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
    expect(screen.getByLabelText('Date')).toHaveAttribute('max', '2026-10-20');

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Il manque la nature et le titre');
    expect(sent).toHaveLength(0);
  });

  it('range les entrées par nature', async () => {
    current = { today: '2026-10-20', entries: [VISIT, PROFILE] };
    renderDossier();

    const profile = await screen.findByRole('region', { name: 'Profil' });
    expect(within(profile).getByText('Pied hyperlaxe')).toBeInTheDocument();
    const visits = screen.getByRole('region', { name: 'Consultations' });
    expect(within(visits).getByText(/Dr Martin/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Semelles' })).not.toBeInTheDocument();
  });

  it('corrige une entrée sous If-Match, sans lui changer de nature', async () => {
    current = { today: '2026-10-20', entries: [PROFILE] };
    renderDossier();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Corriger « Pied hyperlaxe »' }),
    );

    const title = screen.getByLabelText('Titre');
    await userEvent.clear(title);
    await userEvent.type(title, 'Pied hyperlaxe, Achilles courts');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('PATCH');
    expect(sent[0]?.url).toMatch(/\/api\/medical\/0$/);
    expect(JSON.stringify(sent[0]?.headers)).toContain('t0');
    expect(sent[0]?.body).toMatchObject({
      kind: 'profil',
      title: 'Pied hyperlaxe, Achilles courts',
    });
  });
});
