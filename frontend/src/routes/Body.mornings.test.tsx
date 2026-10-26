/**
 * « Le matin » de `/corps` (M-09) : FC de repos et VFC relues en série, corrigées,
 * supprimées.
 *
 * La section est montée seule. Ce que ces cas verrouillent surtout, c'est ce que l'écran
 * ne fait pas : tracer une référence que le serveur n'a pas servie, ou récrire sa phrase.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { MorningSeries, MorningTrend } from '@/features/body/api';
import { createQueryClient } from '@/lib/query';

import { Mornings } from './body/Mornings';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

const calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const BUILDING = 'Ta référence se construit : encore 7 matins.';

function series(overrides: Partial<MorningSeries> = {}): MorningSeries {
  return {
    key: 'resting_hr',
    label: 'FC de repos',
    unit: 'bpm',
    points: [
      { date: '2026-10-20', value: 54 },
      { date: '2026-10-22', value: 52 },
      { date: '2026-10-25', value: 55 },
    ],
    reference_line: null,
    reference: null,
    needed: 7,
    text: BUILDING,
    ...overrides,
  };
}

const TREND: MorningTrend = {
  today: '2026-10-26',
  since: '2026-09-27',
  days: 30,
  series: [
    series(),
    series({
      key: 'hrv_ms',
      label: 'VFC',
      unit: 'ms',
      points: [{ date: '2026-10-25', value: 61 }],
      text: 'Ta référence se construit : encore 9 matins.',
      needed: 9,
    }),
  ],
  entries: [
    { id: 4, token: 'jeton-4', date: '2026-10-25', resting_hr: 55, hrv_ms: 61, source: 'manual' },
    { id: 2, token: 'jeton-2', date: '2026-10-22', resting_hr: 52, hrv_ms: null, source: 'manual' },
    { id: 1, token: 'jeton-1', date: '2026-10-20', resting_hr: 54, hrv_ms: null, source: 'manual' },
  ],
};

function stub(view: unknown = TREND, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      calls.push({ url, init });
      if (init?.method === 'PATCH') return Promise.resolve(json(200, TREND.entries[0]));
      if (init?.method === 'DELETE') return Promise.resolve(json(204, null));
      return Promise.resolve(json(status, view));
    }),
  );
}

function renderSection() {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Toaster>
          <Mornings />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function list(): Promise<HTMLElement> {
  const title = await screen.findByRole('heading', { name: /Matins/ });
  const card = title.parentElement;
  if (card === null) throw new Error('carte introuvable');
  return within(card).getByRole('list');
}

beforeEach(() => {
  calls.length = 0;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('le matin, relu en série (M-09)', () => {
  it('trace la FC servie et dit ce qu’il manque à la référence, sans ligne de référence', async () => {
    stub();
    renderSection();

    expect(await screen.findByRole('img', { name: 'FC de repos' })).toBeInTheDocument();
    // Testing Library ramène l'espace insécable à une espace : la phrase se cherche en motif.
    expect(screen.getByText(/Ta référence se construit\s: encore 7 matins\./)).toBeInTheDocument();
    // Le serveur n'a pas servi de ligne : l'écran n'en trace aucune.
    expect(screen.queryByText('Référence')).toBeNull();
    expect(calls.map((call) => call.url)).toEqual(['/api/body/morning/trend']);
  });

  it('trace la référence quand le serveur la sert, telle quelle', async () => {
    stub({
      ...TREND,
      series: [
        series({
          reference_line: [53, 53.2, 53.1],
          reference: 53.1,
          needed: 0,
          text: 'Ta référence : 53 bpm, la moyenne des 28 jours d’avant.',
        }),
        TREND.series[1],
      ],
    });
    renderSection();

    expect(await screen.findByText('Référence')).toBeInTheDocument();
    expect(screen.getByText(/Ta référence\s: 53 bpm/)).toBeInTheDocument();
  });

  it('passe à la VFC, et dit qu’un seul matin ne fait pas de courbe', async () => {
    stub();
    renderSection();

    await userEvent.click(await screen.findByRole('button', { name: 'VFC' }));

    expect(screen.getByText('VFC : pas encore de courbe')).toBeInTheDocument();
    expect(screen.getByText(/encore 9 matins/)).toBeInTheDocument();
  });

  it('dit ce que coûte le premier matin quand la fenêtre est vide', async () => {
    stub({
      ...TREND,
      series: TREND.series.map((one) => ({ ...one, points: [] })),
      entries: [],
    });
    renderSection();

    expect(await screen.findByText('Aucun matin sur les 30 derniers jours')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parcours du matin' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('affiche le message du serveur quand la lecture échoue, pas un état vide', async () => {
    stub({ code: 'storage_unavailable', message: 'Nextcloud est injoignable.' }, 503);
    renderSection();

    expect(await screen.findByText('Nextcloud est injoignable.')).toBeInTheDocument();
    expect(screen.queryByText(/Aucun matin/)).toBeNull();
  });

  it('corrige un matin sous If-Match, une case vidée partant à null', async () => {
    stub();
    renderSection();

    await userEvent.click(
      within(await list()).getByRole('button', { name: 'Corriger le matin du 25/10/2026' }),
    );
    const hrv = screen.getByLabelText('VFC (ms)');
    expect(hrv).toHaveValue('61');
    await userEvent.clear(hrv);
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le matin' }));

    const patch = await waitFor(() => {
      const found = calls.find((call) => call.init?.method === 'PATCH');
      expect(found).toBeDefined();
      return found;
    });
    expect(patch?.url).toBe('/api/body/morning/4');
    expect(new Headers(patch?.init?.headers).get('If-Match')).toBe('jeton-4');
    expect(JSON.parse(patch?.init?.body as string)).toEqual({
      date: '2026-10-25',
      resting_hr: 55,
      hrv_ms: null,
    });
  });

  it('supprime en deux appuis, sous If-Match', async () => {
    stub();
    renderSection();

    const rows = await list();
    await userEvent.click(
      within(rows).getByRole('button', { name: 'Supprimer le matin du 22/10/2026' }),
    );
    expect(calls.some((call) => call.init?.method === 'DELETE')).toBe(false);

    await userEvent.click(
      within(rows).getByRole('button', { name: 'Supprimer le matin du 22/10/2026 — confirmer' }),
    );

    const removal = await waitFor(() => {
      const found = calls.find((call) => call.init?.method === 'DELETE');
      expect(found).toBeDefined();
      return found;
    });
    expect(removal?.url).toBe('/api/body/morning/2');
    expect(new Headers(removal?.init?.headers).get('If-Match')).toBe('jeton-2');
  });
});
