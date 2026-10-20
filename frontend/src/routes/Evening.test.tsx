/**
 * Le point du soir (`docs/notifications-v3.md`).
 *
 * Le serveur est simulé par ses réponses : c'est lui qui dit si le point est dû et ce
 * qu'il montre. Ce qui se vérifie ici, c'est que **seul « C'est noté »** dit que le point a
 * eu lieu, et que le report part avec la durée réglée.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { EveningFlow } from '@/features/evening/api';
import { createQueryClient } from '@/lib/query';

import { EveningFlowProvider } from './evening/EveningFlow';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

function flow(overrides: Partial<EveningFlow> = {}): EveningFlow {
  return {
    today: '2026-10-19',
    due: true,
    window_open: true,
    done: false,
    snoozed_until: null,
    snooze_min: 30,
    summary: 'Aujourd’hui : course 52 min.',
    debrief: [
      {
        kind: 'run',
        id: 7,
        token: 'tr',
        activity_id: 'r7',
        label: 'Course',
        detail: '52 min · 8,2 km',
        rpe: null,
      },
    ],
    pain: { date: '2026-10-19', activity_id: 'r7', label: 'Course' },
    tomorrow_lines: ['Endurance fondamentale, 40 min — proposée par le coach.'],
    ...overrides,
  };
}

let current: EveningFlow = flow();
const posted: { url: string; method: string; headers: Headers; body: unknown }[] = [];

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
          headers: new Headers(init?.headers),
          body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
        });
      }
      if (url.endsWith('/api/evening/done')) {
        current = { ...current, done: true, due: false };
        return Promise.resolve(json(200, current));
      }
      if (url.endsWith('/api/evening/snooze')) {
        current = { ...current, due: false, snoozed_until: '2026-10-19T20:30:00+02:00' };
        return Promise.resolve(json(200, current));
      }
      if (url.includes('/rpe')) return Promise.resolve(json(200, { rpe: 6 }));
      if (url.endsWith('/api/pain/none')) return Promise.resolve(json(201, {}));
      if (url.endsWith('/api/evening')) return Promise.resolve(json(200, current));
      return Promise.resolve(json(200, {}));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp(path = '/') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Toaster>
          <EveningFlowProvider>
            <p>écran</p>
          </EveningFlowProvider>
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('le point du soir', () => {
  it('s’ouvre quand le serveur le dit dû, avec la journée qu’il a rédigée', async () => {
    renderApp();
    const sheet = await screen.findByRole('dialog');

    expect(within(sheet).getByText('Aujourd’hui : course 52 min.')).toBeInTheDocument();
    expect(within(sheet).getByText('52 min · 8,2 km')).toBeInTheDocument();
    expect(
      within(sheet).getByText('Endurance fondamentale, 40 min — proposée par le coach.'),
    ).toBeInTheDocument();
  });

  it('ne s’ouvre pas de lui-même hors de sa fenêtre, mais s’ouvre depuis une relance', async () => {
    current = flow({ due: false, window_open: false });
    renderApp('/?soir=1');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('note l’effort sous If-Match et demande la douleur pour la séance', async () => {
    renderApp();
    const sheet = await screen.findByRole('dialog');

    await userEvent.click(within(sheet).getByRole('button', { name: '6' }));
    await waitFor(() => {
      expect(posted.some((item) => item.url.includes('/runs/7/rpe'))).toBe(true);
    });
    const rated = posted.find((item) => item.url.includes('/runs/7/rpe'));
    expect(rated?.headers.get('If-Match')).toBe('tr');

    await userEvent.click(within(sheet).getByRole('button', { name: 'Non' }));
    await waitFor(() => {
      expect(posted.find((item) => item.url.endsWith('/api/pain/none'))?.body).toEqual({
        date: '2026-10-19',
        run_id: 'r7',
      });
    });
  });

  it('« C’est noté » seul dit que le point a eu lieu', async () => {
    renderApp();
    const sheet = await screen.findByRole('dialog');

    await userEvent.click(within(sheet).getByRole('button', { name: 'C’est noté' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(posted.map((item) => item.url)).toContain('/api/evening/done');
  });

  it('reporte de la durée réglée', async () => {
    current = flow({ snooze_min: 45 });
    renderApp();
    const sheet = await screen.findByRole('dialog');

    await userEvent.click(within(sheet).getByRole('button', { name: 'Rappelle-moi dans 45 min' }));
    await waitFor(() => {
      expect(posted.map((item) => item.url)).toContain('/api/evening/snooze');
    });
    expect(posted.map((item) => item.url)).not.toContain('/api/evening/done');
  });
});
