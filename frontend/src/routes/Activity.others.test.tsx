/**
 * Le vélo et la marche dans l'historique (`docs/charge-multisport.md`, D8).
 *
 * Ils se comptent, ils ne s'analysent pas : la seule chose qu'on leur demande à l'écran,
 * c'est l'effort perçu — sous `If-Match`, comme toute note — et, depuis la session 10 b,
 * la correction en place. Leur saisie à la main (M-16) a quitté l'écran le 29 octobre.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { ActivityItem } from '@/features/activity/api';
import { createQueryClient } from '@/lib/query';

import { OtherSheet } from './activity/OtherSheet';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const WALK: ActivityItem = {
  kind: 'other',
  id: 3,
  token: 'tw',
  date: '2026-10-18',
  label: 'Marche',
  duration_min: 50,
  distance_km: 4.2,
  pace_min_km: null,
  rpe: null,
  entries: 0,
  source: 'manual',
  distance_m: null,
  swim_id: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('une sortie marche ou vélo', () => {
  it('se note sous If-Match, et la feuille se ferme sur la note', async () => {
    const mock = vi.fn(() => Promise.resolve(json(200, { ...WALK, rpe: 3 })));
    vi.stubGlobal('fetch', mock);
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <Toaster>
            <OtherSheet item={WALK} today="2026-10-27" onClose={onClose} />
          </Toaster>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Marche du 18/10')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: '3' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/activity/others/3/rpe');
    expect(new Headers(init.headers).get('If-Match')).toBe('tw');
  });
});

describe('corriger une sortie (session 10 b)', () => {
  const STORED = {
    ...WALK,
    other_id: 'o-stable',
    sport: 'marche',
    start: null,
    avg_hr: null,
    max_hr: null,
    elevation_m: null,
    calories: null,
    note: null,
    // La liste relue porte un jeton plus récent que l'historique : c'est lui qui part.
    token: 'tw2',
    distance_km: 4.2,
  };

  function renderSheet(fetcher: (url: string, init?: RequestInit) => Response) {
    const mock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(fetcher(url, init)));
    vi.stubGlobal('fetch', mock);
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <Toaster>
            <OtherSheet item={WALK} today="2026-10-27" onClose={onClose} />
          </Toaster>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return { mock, onClose };
  }

  it('ouvre le formulaire de la saisie, pré-rempli, et corrige sous If-Match', async () => {
    const { mock, onClose } = renderSheet((url, init) => {
      if (url === '/api/activity/others/3' && init?.method === 'PATCH') {
        return json(200, { ...STORED, sport: 'vélo', duration_min: 65 });
      }
      if (url === '/api/activity/others') {
        return json(200, { others: [STORED], sports: SPORTS });
      }
      return json(404, {});
    });

    const sheet = await screen.findByRole('dialog');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Corriger la sortie' }));
    expect(await within(sheet).findByLabelText('Durée')).toHaveValue('50');
    expect(within(sheet).getByLabelText('Distance (km)')).toHaveValue('4,2');
    expect(within(sheet).getByLabelText('Date')).toHaveValue('2026-10-18');

    await userEvent.click(within(sheet).getByRole('button', { name: 'Vélo' }));
    await userEvent.clear(within(sheet).getByLabelText('Durée'));
    await userEvent.type(within(sheet).getByLabelText('Durée'), '1h05');
    await userEvent.click(within(sheet).getByRole('button', { name: '5' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Corriger la sortie' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    const patch = mock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(new Headers(patch?.[1]?.headers).get('If-Match')).toBe('tw2');
    expect(JSON.parse(patch?.[1]?.body as string)).toEqual({
      date: '2026-10-18',
      sport: 'vélo',
      duration_min: '1h05',
      distance_km: '4,2',
      rpe: 5,
    });
    // Une correction ne redemande pas la douleur : elle l'a été à la saisie.
    expect(mock.mock.calls.some(([url]) => url === '/api/pain/none')).toBe(false);
  });

  it('dit qu’une sortie disparue ne se corrige plus', async () => {
    renderSheet((url) =>
      url === '/api/activity/others' ? json(200, { others: [], sports: SPORTS }) : json(404, {}),
    );
    const sheet = await screen.findByRole('dialog');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Corriger la sortie' }));
    expect(await within(sheet).findByText('Sortie introuvable')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Corriger la sortie' })).toBeNull();
  });
});

const SPORTS = [
  { value: 'vélo', label: 'Vélo' },
  { value: 'marche', label: 'Marche' },
  { value: 'randonnée', label: 'Randonnée' },
];
