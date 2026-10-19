import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { SwimDetail, SwimList } from '@/features/activity/api';
import type { SwimProgram } from '@/features/planning/api';
import { createQueryClient } from '@/lib/query';

import { Activity } from './Activity';
import { Swims } from './activity/Swims';

/**
 * La natation, activité à part entière (`docs/natation-activite.md`).
 *
 * Ce qu'un test d'API ne voit pas : que la saisie **n'envoie pas de distance** — elle est
 * le total que le serveur lit —, que l'historique écrit une natation en mètres et l'ouvre
 * dans sa feuille, qu'elle se supprime sous `If-Match`, et qu'une semaine sans bassin se
 * dit d'un tiret.
 */

const TODAY = '2026-10-19';

const TYPED: SwimDetail = {
  id: 1,
  token: 'jeton-nage',
  swim_id: 'nage02',
  date: '2026-10-18',
  start: null,
  pool_m: 25,
  distance_m: 700,
  duration_s: 2400,
  elapsed_s: null,
  avg_hr: null,
  max_hr: null,
  strokes: null,
  calories: null,
  pace_100_s: null,
  suspect_laps: 0,
  lines: [
    {
      text: '200 CR EF',
      distance_m: 200,
      laps: [],
      suspect: false,
      detected: false,
      section: false,
    },
    {
      text: '8×50 CR SP R30',
      distance_m: 400,
      laps: [],
      suspect: false,
      detected: false,
      section: false,
    },
  ],
  laps: [],
  source: 'manual',
  program: '200 cr ef\n8x50 CR SP R30',
  note: 'lignes 4',
};

const LIST: SwimList = {
  swims: [{ ...TYPED }],
  weeks: [
    { week: '2026-09-28', distance_m: 0, sessions: 0 },
    { week: '2026-10-05', distance_m: 850, sessions: 1 },
    { week: '2026-10-12', distance_m: 700, sessions: 1 },
    { week: '2026-10-19', distance_m: 0, sessions: 0 },
  ],
};

const PARSED: SwimProgram = {
  lines: [{ number: 1, kind: 'block', text: '400 CR EF', distance_m: 400 }],
  errors: [],
  total_m: 400,
  by_stroke: [{ code: 'CR', label: 'crawl', distance_m: 400 }],
  by_pace: [],
  rest_s: null,
};

const OVERVIEW = {
  today: TODAY,
  week: { week_start: TODAY, minutes: 40, sessions: 1, distance_km: 0, pace_min_km: null },
  days: [],
  weeks: [],
  neglected: [],
  history: [
    {
      kind: 'swim',
      id: 1,
      token: 'jeton-nage',
      date: '2026-10-18',
      label: 'Natation',
      duration_min: 40,
      distance_km: null,
      pace_min_km: null,
      rpe: null,
      entries: 0,
      source: 'manual',
      distance_m: 700,
      swim_id: 'nage02',
    },
  ],
  total: 1,
};

interface Call {
  url: string;
  init: RequestInit | undefined;
}

const calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

function stub() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      calls.push({ url, init });
      if (url.includes('/api/ai/status'))
        return Promise.resolve(json(200, { enabled: false, message: 'Aucune clé.' }));
      if (url.includes('/activity/circuits')) return Promise.resolve(json(200, { items: [] }));
      if (url.includes('/api/planning/swim/parse')) return Promise.resolve(json(200, PARSED));
      if (url.includes('/api/planning/swim/codes'))
        return Promise.resolve(json(200, { codes: [] }));
      if (url.endsWith('/api/activity/swims') && (init?.method ?? 'GET') === 'GET')
        return Promise.resolve(json(200, LIST));
      if (url.includes('/api/activity/swims')) return Promise.resolve(json(200, TYPED));
      if (url.endsWith('/api/activity')) return Promise.resolve(json(200, OVERVIEW));
      return Promise.resolve(json(200, {}));
    }),
  );
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Toaster>
          <Routes>
            <Route path="/activite" element={<Activity />} />
            <Route path="/activite/natations" element={<Swims />} />
          </Routes>
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function writes(): Call[] {
  return calls.filter((call) => (call.init?.method ?? 'GET') !== 'GET');
}

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('enregistrer une natation', () => {
  it('envoie le programme et la durée, jamais une distance', async () => {
    const user = userEvent.setup();
    stub();
    renderAt('/activite');

    await user.click(await screen.findByRole('button', { name: 'Enregistrer une natation' }));
    const sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByLabelText('Durée'), '40');
    await user.type(within(sheet).getByLabelText('Programme'), '400 cr ef');
    // L'aperçu est celui du serveur : c'est lui qui dira la distance.
    expect(await within(sheet).findByText('Lu par le serveur')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer la natation' }));

    await waitFor(() => {
      expect(writes().some((call) => call.url.endsWith('/api/activity/swims'))).toBe(true);
    });
    const posted = writes().find((call) => call.url.endsWith('/api/activity/swims'));
    const body = JSON.parse(posted?.init?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ date: TODAY, duration_min: '40', program: '400 cr ef' });
    expect(body).not.toHaveProperty('distance_m');
  });

  it('propose aussi le fichier de la montre', async () => {
    const user = userEvent.setup();
    stub();
    renderAt('/activite');

    await user.click(await screen.findByRole('button', { name: 'Enregistrer une natation' }));

    expect(await screen.findByText('importer le .fit de la montre')).toBeInTheDocument();
  });
});

describe('une natation dans l’historique', () => {
  it('se dit en mètres et s’ouvre dans sa feuille', async () => {
    const user = userEvent.setup();
    stub();
    renderAt('/activite');

    expect(await screen.findByText(/^700\s?m$/u)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voir la natation du 18/10/2026' }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/activity/swims/nage02'))).toBe(true);
    });
    expect(await screen.findByText('8×50 CR SP R30')).toBeInTheDocument();
  });

  it('se supprime en deux appuis, sous If-Match', async () => {
    const user = userEvent.setup();
    stub();
    renderAt('/activite');

    const remove = await screen.findByRole('button', {
      name: 'Supprimer la natation du 18/10/2026 et ses tours',
    });
    await user.click(remove);
    expect(writes()).toHaveLength(0);
    await user.click(
      screen.getByRole('button', { name: /Supprimer la natation du 18\/10\/2026 et ses tours/ }),
    );

    await waitFor(() => {
      expect(writes().some((call) => call.init?.method === 'DELETE')).toBe(true);
    });
    const deleted = writes().find((call) => call.init?.method === 'DELETE');
    expect(deleted?.url).toContain('/api/activity/swims/1');
    expect((deleted?.init?.headers as Record<string, string>)['If-Match']).toBe('jeton-nage');
  });
});

describe('la page Natation', () => {
  it('dit les mètres des semaines, et un tiret pour une semaine sans bassin', async () => {
    stub();
    renderAt('/activite/natations');

    expect(await screen.findByText(/850\s?m · 1 séance/u)).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText(/^0\s?m/u)).not.toBeInTheDocument();
  });

  it('rouvre une natation saisie sur le programme tel qu’il a été tapé', async () => {
    const user = userEvent.setup();
    stub();
    renderAt('/activite/natations');

    await user.click(await screen.findByRole('button', { name: /Natation du 18\/10/ }));
    await user.click(await screen.findByRole('button', { name: 'Corriger la séance' }));

    const field = await screen.findByLabelText('Programme');
    expect(field).toHaveValue('200 cr ef\n8x50 CR SP R30');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(writes().some((call) => call.init?.method === 'PATCH')).toBe(true);
    });
    const patch = writes().find((call) => call.init?.method === 'PATCH');
    expect((patch?.init?.headers as Record<string, string>)['If-Match']).toBe('jeton-nage');
  });
});
