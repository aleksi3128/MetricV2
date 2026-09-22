/**
 * Le parcours du matin (`docs/coach-course.md` §5).
 *
 * Le serveur est simulé **par ses réponses** : c'est lui qui dit si la feuille est due et
 * où reprendre, et l'écran n'a le droit de décider ni l'un ni l'autre. Un test qui ferait
 * avancer l'étape côté écran validerait exactement ce que le plan interdit.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MorningFlow } from '@/features/morning/api';
import { createQueryClient } from '@/lib/query';

import { MorningFlowProvider } from './morning/MorningFlow';

const READINESS = {
  status: 'unknown' as const,
  text: 'Pas encore de mesure ce matin.',
  resting_hr: null,
  hrv_ms: null,
  rhr_baseline: null,
  rhr_delta: null,
  hrv_baseline: null,
  hrv_low: null,
  hrv_high: null,
  mornings: 0,
  needed: 10,
};

function flow(overrides: Partial<MorningFlow> = {}): MorningFlow {
  const resume = overrides.resume === undefined ? 'night' : overrides.resume;
  const order = ['night', 'weight', 'session', 'day'] as const;
  const titles = { night: 'Ta nuit', weight: 'Pesée', session: 'Ta séance', day: 'Ta journée' };
  return {
    today: '2026-09-20',
    due: true,
    window_open: true,
    snoozed: false,
    resume,
    steps: order.map((key) => ({
      key,
      title: titles[key],
      done: resume === null ? true : order.indexOf(key) < order.indexOf(resume),
    })),
    night: { today: '2026-09-20', entry: null, readiness: READINESS, recent: [] },
    weight: {
      today: null,
      last: {
        id: 3,
        token: 't',
        date: '2026-09-18',
        weight_kg: 59.85,
        note: null,
        source: 'manual',
      },
    },
    session: { planned: [], coach: null },
    day: { unrated_runs: [], meals_yesterday: 3, supplements: [], planned: [] },
    ...overrides,
  };
}

let current: MorningFlow = flow();
const posted: { url: string; body: unknown; method: string }[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  posted.length = 0;
  current = flow();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        posted.push({
          url,
          method,
          body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
        });
      }
      if (url.endsWith('/api/morning/snooze')) {
        current = { ...current, due: false, snoozed: true };
        return Promise.resolve(json(200, current));
      }
      if (url.endsWith('/api/morning/pass')) return Promise.resolve(json(200, current));
      if (url.endsWith('/api/body/morning') && method === 'POST') {
        current = flow({ resume: 'weight' });
        return Promise.resolve(json(201, { id: 0, token: 'm', date: '2026-09-20' }));
      }
      return Promise.resolve(json(200, current));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp() {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MorningFlowProvider>
          <p>écran</p>
        </MorningFlowProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('le parcours du matin', () => {
  it('s’ouvre de lui-même quand le serveur le dit dû, sur l’étape qu’il désigne', async () => {
    renderApp();

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Étape 1 sur 4 · Ta nuit')).toBeInTheDocument();
    // Vides : jamais préremplis de la veille.
    expect(within(sheet).getByLabelText('FC de repos')).toHaveValue('');
    expect(within(sheet).getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('ne s’ouvre pas quand le serveur ne le dit pas dû', async () => {
    current = flow({ due: false });
    renderApp();

    await screen.findByText('écran');
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('écrit la nuit au jour du serveur, puis passe où le serveur dit de reprendre', async () => {
    renderApp();
    const sheet = await screen.findByRole('dialog');

    await userEvent.type(within(sheet).getByLabelText('FC de repos'), '51');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));

    await screen.findByText('Étape 2 sur 4 · Pesée');
    const sent = posted.find((item) => item.url.endsWith('/api/body/morning'));
    expect(sent?.body).toEqual({ date: '2026-09-20', resting_hr: 51, hrv_ms: null });
    // La dernière pesée est rappelée ; le champ, lui, reste vide.
    expect(
      screen.getByText('Dernière pesée : 59,85 kg le vendredi 18 septembre.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Poids')).toHaveValue('');
  });

  it('se tait jusqu’au lendemain sur « Pas ce matin »', async () => {
    renderApp();
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'Pas ce matin' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(posted.map((item) => item.url)).toContain('/api/morning/snooze');
  });

  it('fermé sans finir, revient au retour de l’application au premier plan', async () => {
    renderApp();
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('demande l’effort perçu de la sortie d’hier dans la journée', async () => {
    current = flow({
      resume: 'day',
      day: {
        unrated_runs: [
          {
            id: 11,
            token: 'r',
            date: '2026-09-19',
            distance_km: 6.006,
          } as MorningFlow['day']['unrated_runs'][number],
        ],
        meals_yesterday: 0,
        supplements: [],
        planned: [],
      },
    });
    renderApp();

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/Ta sortie d’hier, 6,01 km/)).toBeInTheDocument();
    expect(
      within(sheet).getByRole('group', { name: 'Effort perçu, de 1 à 10' }),
    ).toBeInTheDocument();
    expect(within(sheet).getByText(/Aucun repas noté hier/)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Terminer' })).toBeInTheDocument();
  });
});
