/**
 * Le vélo et la marche dans l'historique (`docs/charge-multisport.md`, D8).
 *
 * Ils se comptent, ils ne s'analysent pas : la seule chose qu'on leur demande à l'écran,
 * c'est l'effort perçu — sous `If-Match`, comme toute note. Et, depuis M-16, ils se
 * saisissent à la main, au troisième choix de la feuille « Course ».
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { ActivityItem } from '@/features/activity/api';
import { createQueryClient } from '@/lib/query';

import { NewActivitySheet } from './activity/NewActivitySheet';
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
            <OtherSheet item={WALK} onClose={onClose} />
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

const SPORTS = [
  { value: 'vélo', label: 'Vélo' },
  { value: 'marche', label: 'Marche' },
  { value: 'randonnée', label: 'Randonnée' },
];

function renderEntry(fetcher: (url: string, init?: RequestInit) => Response) {
  const mock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(fetcher(url, init)));
  vi.stubGlobal('fetch', mock);
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>
          <NewActivitySheet open today="2026-10-27" onClose={onClose} onSwimImported={vi.fn()} />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { mock, onClose };
}

describe('un vélo ou une marche saisis à la main (M-16)', () => {
  it('prend ses sports du serveur, n’en choisit aucun, et envoie l’effort avec la sortie', async () => {
    const { mock, onClose } = renderEntry((url, init) => {
      if (url.includes('/api/ai/status')) return json(200, { enabled: false, message: 'non' });
      if (url === '/api/activity/others' && init?.method === 'POST') {
        return json(201, { ...WALK, other_id: 'o-stable', sport: 'vélo', rpe: 4 });
      }
      if (url === '/api/pain/none') return json(201, {});
      if (url === '/api/activity/others') return json(200, { others: [], sports: SPORTS });
      return json(404, {});
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Vélo ou marche, à la main' }));
    const sheet = await screen.findByRole('dialog', { name: 'Vélo ou marche' });
    const sports = await within(sheet).findByRole('group', { name: 'Sport' });
    expect(
      within(sports)
        .getAllByRole('button')
        .map((chip) => chip.textContent),
    ).toEqual(['Vélo', 'Marche', 'Randonnée']);
    // Aucun sport d'office : l'enregistrement attend qu'on en choisisse un.
    const commit = within(sheet).getByRole('button', { name: 'Enregistrer la sortie' });
    expect(commit).toBeDisabled();
    expect(
      within(sheet).getByText(/Sans lui, la sortie est enregistrée mais ne compte pas/),
    ).toBeInTheDocument();

    await userEvent.click(within(sports).getByRole('button', { name: 'Vélo' }));
    await userEvent.type(within(sheet).getByLabelText('Durée'), '1h30');
    await userEvent.click(within(sheet).getByRole('button', { name: '4' }));
    await userEvent.click(commit);

    // La douleur ensuite (session 10 b), rattachée par l'identifiant stable de la sortie.
    expect(
      await within(sheet).findByText(/Une douleur pendant ou après cette séance/),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Non' }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    const none = mock.mock.calls.find(([url]) => url === '/api/pain/none');
    expect(JSON.parse(none?.[1]?.body as string)).toEqual({
      date: '2026-10-18',
      run_id: 'o-stable',
    });
    const post = mock.mock.calls.find(
      ([url, init]) => url === '/api/activity/others' && init?.method === 'POST',
    );
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      date: '2026-10-27',
      sport: 'vélo',
      duration_min: '1h30',
      distance_km: null,
      rpe: 4,
    });
  });

  it('retire l’effort d’un second appui, et part sans lui', async () => {
    const { mock } = renderEntry((url, init) => {
      if (url.includes('/api/ai/status')) return json(200, { enabled: false, message: 'non' });
      if (url === '/api/activity/others' && init?.method === 'POST') return json(201, WALK);
      if (url === '/api/activity/others') return json(200, { others: [], sports: SPORTS });
      return json(404, {});
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Vélo ou marche, à la main' }));
    const sheet = await screen.findByRole('dialog', { name: 'Vélo ou marche' });
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Marche' }));
    await userEvent.type(within(sheet).getByLabelText('Durée'), '50');
    await userEvent.click(within(sheet).getByRole('button', { name: '3' }));
    await userEvent.click(within(sheet).getByRole('button', { name: '3' }));
    expect(within(sheet).getByText('1 très facile · 10 à fond')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer la sortie' }));

    await waitFor(() => {
      expect(mock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = mock.mock.calls.find(
      ([url, init]) => url === '/api/activity/others' && init?.method === 'POST',
    );
    expect(JSON.parse(post?.[1]?.body as string)).toMatchObject({ sport: 'marche', rpe: null });
  });

  it('dit que la saisie est indisponible quand la liste des sports ne vient pas', async () => {
    renderEntry((url) => {
      if (url.includes('/api/ai/status')) return json(200, { enabled: false, message: 'non' });
      if (url === '/api/activity/others') {
        return json(409, { code: 'storage_conflict', message: 'Fichier en cours d’écriture.' });
      }
      return json(404, {});
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Vélo ou marche, à la main' }));
    const sheet = await screen.findByRole('dialog', { name: 'Vélo ou marche' });
    expect(await within(sheet).findByText('Saisie indisponible')).toBeInTheDocument();
    expect(within(sheet).getByText('Fichier en cours d’écriture.')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Enregistrer la sortie' })).toBeNull();
  });
});
