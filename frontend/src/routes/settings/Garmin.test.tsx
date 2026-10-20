/**
 * La carte de la synchro Garmin (`docs/synchro-garmin.md`) : elle dit ce que dit le serveur,
 * et rappelle la voie du .fit quand la synchro est hors service (CA-08).
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { SyncView } from '@/features/sync/api';
import { createQueryClient } from '@/lib/query';

import { GarminCard } from './Garmin';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

function renderCard(view: SyncView) {
  const mock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(
      init?.method === 'POST'
        ? json(200, { received: ['Sortie de 8,2 km'], health_days: 1, error: null })
        : json(200, view),
    ),
  );
  vi.stubGlobal('fetch', mock);
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Toaster>
        <GarminCard />
      </Toaster>
    </QueryClientProvider>,
  );
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la synchro Garmin', () => {
  it('hors service, dit ce qui manque et rappelle le .fit', async () => {
    renderCard({
      available: false,
      message:
        'Synchro Garmin non configurée : GARMIN_EMAIL et GARMIN_PASSWORD sont vides. L’import d’un .fit reste possible.',
      last_success: null,
      last_success_text: null,
      last_error: null,
      imported: 0,
    });

    expect(await screen.findByText('hors service')).toBeInTheDocument();
    expect(screen.getByText(/GARMIN_EMAIL/)).toBeInTheDocument();
    // Le rappel du .fit est dans le message du serveur, une fois — pas redit par la carte.
    expect(screen.getAllByText(/\.fit/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Synchroniser maintenant' })).toBeNull();
  });

  it('active, synchronise à la demande', async () => {
    const mock = renderCard({
      available: true,
      message: 'Synchro Garmin configurée : toutes les 30 minutes.',
      last_success: '2026-10-20T09:00:00+02:00',
      last_success_text: 'le 20/10 à 09:00',
      last_error: null,
      imported: 4,
    });

    expect(await screen.findByText(/le 20\/10 à 09:00 · 4 séances reçues/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Synchroniser maintenant' }));
    await waitFor(() => {
      expect(mock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
  });
});
