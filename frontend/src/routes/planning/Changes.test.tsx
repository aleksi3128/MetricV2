/**
 * Ce que le coach a changé, et l'agenda (`docs/agenda-replanification.md`).
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { AgendaView, PlanChange } from '@/features/planning/api';
import { createQueryClient } from '@/lib/query';

import { AgendaCard } from './AgendaCard';
import { Changes } from './Changes';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const CHANGE: PlanChange = {
  key: 'pain-stop:s1',
  action: 'rest',
  summary: 'Seuil → Repos — mar. 20/10',
  reason: 'Douleur vive. Repère : la douleur passe avant le plan.',
  date: '2026-10-20',
  status: 'pending',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrap(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <Toaster>{node}</Toaster>
    </QueryClientProvider>,
  );
}

describe('ce que le coach a changé', () => {
  it('dit la modification et sa raison, et « non » demande de la défaire', async () => {
    const mock = vi.fn(() => Promise.resolve(json(200, [])));
    vi.stubGlobal('fetch', mock);
    wrap(<Changes changes={[CHANGE]} />);

    expect(screen.getByText('Seuil → Repos — mar. 20/10')).toBeInTheDocument();
    expect(screen.getByText(CHANGE.reason)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Non, remets comme avant' }));

    await waitFor(() => {
      expect(mock).toHaveBeenCalled();
    });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/planning/changes/pain-stop%3As1');
    expect(init.body).toBe(JSON.stringify({ accept: false }));
  });
});

describe('l’agenda', () => {
  it('n’affiche que l’indice du lien, et vide le champ après l’envoi', async () => {
    const linked: AgendaView = {
      configured: true,
      hint: 'p53-caldav.icloud.com · …abcd',
      events: 4,
      unsupported: 0,
      error: null,
    };
    let current: AgendaView = {
      configured: false,
      hint: null,
      events: 0,
      unsupported: 0,
      error: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') current = linked;
        return Promise.resolve(json(200, current));
      }),
    );
    wrap(<AgendaCard />);

    const field = await screen.findByLabelText('Lien de l’agenda');
    await userEvent.type(field, 'webcal://p53-caldav.icloud.com/published/2/SECRETabcd');
    await userEvent.click(screen.getByRole('button', { name: 'Relier l’agenda' }));

    expect(await screen.findByText(/4 créneaux occupés cette semaine/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/SECRET/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('SECRET');
  });

  it('se replie une fois relié, et n’oublie le lien qu’au second appui (M-04)', async () => {
    const linked: AgendaView = {
      configured: true,
      hint: 'p53-caldav.icloud.com · …abcd',
      events: 2,
      unsupported: 0,
      error: null,
    };
    const mock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        json(200, init?.method === 'PATCH' ? { ...linked, configured: false, hint: null } : linked),
      ),
    );
    vi.stubGlobal('fetch', mock);
    wrap(<AgendaCard />);

    // Replié : l'état et « Modifier », aucun champ.
    expect(await screen.findByText(/2 créneaux occupés cette semaine/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Changer le lien')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(screen.getByLabelText('Changer le lien')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Oublier le lien' }));
    expect(mock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Oublier le lien — confirmer' }));
    await waitFor(() => {
      expect(mock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
  });

  it('dit la panne au lieu de passer pour « non relié »', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(json(422, { code: 'validation_error', message: 'Agenda illisible ici.' })),
      ),
    );
    wrap(<AgendaCard />);

    expect(await screen.findByText('Agenda illisible ici.')).toBeInTheDocument();
    expect(screen.queryByText(/Le lien public de ton agenda iCloud/)).toBeNull();
    expect(screen.queryByText('non relié')).toBeNull();
  });
});
