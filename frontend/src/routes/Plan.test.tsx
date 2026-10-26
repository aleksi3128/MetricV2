/**
 * Le plan de course (`docs/plan-course.md`).
 *
 * Le serveur est simulé par ses réponses. Ce qui se vérifie : rien ne se décide sans un
 * oui (CA-07), aucune pastille n'est choisie d'office, et reposer un plan s'arme avant de
 * remplacer.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { PlanView, RaceList } from '@/features/races/api';
import { createQueryClient } from '@/lib/query';

import { Plan } from './Plan';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const LIST: RaceList = {
  today: '2026-10-20',
  races: [
    {
      id: 0,
      token: 't0',
      race_id: 'm1',
      name: 'Marathon de Paris',
      date: '2027-04-11',
      distance: 'marathon',
      distance_label: 'Marathon',
      priority: 'A',
      target: null,
      note: null,
      countdown: 'dans 24 semaines',
      past: false,
    },
    {
      id: 1,
      token: 't1',
      race_id: 'i1',
      name: 'Ironman de Nice',
      date: '2027-06-27',
      distance: 'ironman',
      distance_label: 'Ironman',
      priority: 'A',
      target: null,
      note: null,
      countdown: 'dans 35 semaines',
      past: false,
    },
  ],
  conflicts: [
    {
      key: 'm1|i1',
      keep: 'i1',
      demote: 'm1',
      text: 'Je garde Ironman de Nice en A et je passe Marathon de Paris en B.',
    },
  ],
  next_a: 'm1',
};

const PLAN: PlanView = {
  race_id: 'm1',
  summary: '24 semaines jusqu’à Marathon de Paris : de 20 à 65 km par semaine.',
  warnings: [],
  weeks: [
    {
      start: '2026-10-26',
      phase: 'base',
      km: 21.6,
      long_km: 9.5,
      sessions: [
        {
          date: '2026-10-27',
          weekday: 'mardi',
          title: 'Endurance fondamentale',
          notation: '6 km EF + 6 × 80 m LD',
          minutes: 40,
          km: 6,
          race: false,
        },
      ],
    },
  ],
  placed: 12,
};

const calls: { url: string; method: string; body: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      const method = init?.method ?? 'GET';
      calls.push({
        url,
        method,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
      });
      if (url.includes('/api/races/plan/') && method === 'GET')
        return Promise.resolve(json(200, PLAN));
      if (url.includes('/api/races/plan/') && method === 'POST')
        return Promise.resolve(json(200, { created: 30, removed: 12 }));
      if (url.includes('/conflicts/'))
        return Promise.resolve(json(200, { ...LIST, conflicts: [] }));
      return Promise.resolve(json(200, LIST));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPlan() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>
          <Plan />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('le plan de course', () => {
  it('ne change rien sans un oui, puis transmet la réponse', async () => {
    renderPlan();
    expect(
      await screen.findByText('Je garde Ironman de Nice en A et je passe Marathon de Paris en B.'),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Oui, fais-le' }));
    await waitFor(() => {
      expect(calls.find((call) => call.url.includes('/conflicts/'))?.body).toEqual({
        accept: true,
      });
    });
    expect(calls.find((call) => call.url.includes('/conflicts/'))?.url).toBe(
      '/api/races/conflicts/m1%7Ci1',
    );
  });

  it('ne choisit ni la distance ni la priorité d’office', async () => {
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter une course visée' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la course visée' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Il manque le nom, la date, la distance, la priorité.',
    );
  });

  it('montre le plan en notation, et arme avant de remplacer un plan posé', async () => {
    renderPlan();
    expect(await screen.findByText('6 km EF + 6 × 80 m LD')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reposer au planning' }));
    expect(calls.some((call) => call.method === 'POST' && call.url.includes('/plan/'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Remplacer les 12 séances ?' }));
    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST' && call.url.includes('/plan/m1'))).toBe(
        true,
      );
    });
  });

  it('ne porte ni l’agenda ni ce que le coach a changé (M-03)', async () => {
    // Les deux servent à toutes les séances : ils vivent sur `/planning`. L'écran ne les
    // demande même plus au serveur.
    renderPlan();
    expect(await screen.findByText('6 km EF + 6 × 80 m LD')).toBeInTheDocument();

    expect(screen.queryByText('Agenda')).toBeNull();
    expect(screen.queryByText('Ce que le coach a changé')).toBeNull();
    expect(calls.some((call) => call.url.includes('/api/planning/'))).toBe(false);
  });
});
