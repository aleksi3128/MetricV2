/**
 * Le plan de course (`docs/plan-course.md`).
 *
 * Le serveur est simulé par ses réponses. Ce qui se vérifie : rien ne se décide sans un
 * oui (CA-07), aucune pastille n'est choisie d'office, et reposer un plan s'arme avant de
 * remplacer. Depuis M-17 : une course visée se corrige en place, sous `If-Match`, et le
 * bandeau du plan qui ne suit plus arme avant de reposer.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  stale_plan: null,
  distances: [
    { value: '5k', label: '5 km' },
    { value: '10k', label: '10 km' },
    { value: 'semi', label: 'Semi-marathon' },
    { value: 'marathon', label: 'Marathon' },
    { value: 'sprint', label: 'Triathlon sprint' },
    { value: 'olympique', label: 'Triathlon olympique' },
    { value: '70.3', label: 'Half Ironman (70.3)' },
    { value: 'ironman', label: 'Ironman' },
  ],
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

const calls: { url: string; method: string; body: unknown; ifMatch: string | null }[] = [];
/** Ce que rend la liste ; un test peut la remplacer avant le rendu. */
let list: RaceList = LIST;
/** La réponse d'une correction ; `null` rend la liste telle quelle. */
let patched: Response | null = null;

beforeEach(() => {
  calls.length = 0;
  list = LIST;
  patched = null;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      const method = init?.method ?? 'GET';
      calls.push({
        url,
        method,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
        ifMatch: new Headers(init?.headers).get('If-Match'),
      });
      if (method === 'PATCH') return Promise.resolve(patched ?? json(200, list));
      if (url.includes('/api/races/plan/') && method === 'GET')
        return Promise.resolve(json(200, PLAN));
      if (url.includes('/api/races/plan/') && method === 'POST')
        return Promise.resolve(json(200, { created: 30, removed: 12 }));
      if (url.includes('/conflicts/'))
        return Promise.resolve(json(200, { ...LIST, conflicts: [] }));
      return Promise.resolve(json(200, list));
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

  it('propose les distances servies, dans leur ordre et sous leur libellé', async () => {
    list = {
      ...LIST,
      distances: [
        { value: 'semi', label: 'Semi-marathon' },
        { value: '5k', label: '5 km' },
      ],
    };
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter une course visée' }));

    // Rien n'est écrit dans l'écran : deux distances servies, deux pastilles.
    const group = screen.getByRole('group', { name: 'Distance' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((chip) => chip.textContent),
    ).toEqual(['Semi-marathon', '5 km']);
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

describe('corriger une course visée (M-17)', () => {
  it('rouvre le formulaire d’ajout en place, pré-rempli, et corrige sous If-Match', async () => {
    renderPlan();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Corriger la course visée Ironman de Nice' }),
    );

    const form = screen.getByRole('heading', { name: 'Corriger Ironman de Nice' }).closest('li');
    expect(form).not.toBeNull();
    const inside = within(form as HTMLElement);
    expect(inside.getByLabelText('Nom')).toHaveValue('Ironman de Nice');
    expect(inside.getByLabelText('Date')).toHaveValue('2027-06-27');
    expect(inside.getByRole('button', { name: 'Ironman' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(inside.getByRole('button', { name: 'B — important' }));
    await userEvent.type(inside.getByLabelText('Chrono visé'), '12:30:00');
    await userEvent.click(inside.getByRole('button', { name: 'Corriger la course visée' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
    });
    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.url).toBe('/api/races/1');
    expect(patch?.ifMatch).toBe('t1');
    expect(patch?.body).toEqual({
      name: 'Ironman de Nice',
      date: '2027-06-27',
      distance: 'ironman',
      priority: 'B',
      target: '12:30:00',
      note: null,
    });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Corriger Ironman de Nice' })).toBeNull();
    });
  });

  it('remonte le conflit tel que le serveur le rédige, referme, et recharge la liste', async () => {
    patched = json(409, { code: 'conflict', message: 'Cette ligne a changé depuis.' });
    renderPlan();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Corriger la course visée Marathon de Paris' }),
    );
    const reads = calls.filter((call) => call.url === '/api/races').length;
    await userEvent.click(screen.getByRole('button', { name: 'Corriger la course visée' }));

    expect(await screen.findByText('Cette ligne a changé depuis.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Corriger Marathon de Paris' })).toBeNull();
    await waitFor(() => {
      expect(calls.filter((call) => call.url === '/api/races').length).toBeGreaterThan(reads);
    });
  });

  it('montre le plan qui ne suit plus, et arme avant de le reposer', async () => {
    list = {
      ...LIST,
      stale_plan: {
        reason: 'date',
        race_id: 'm1',
        title: 'Le plan posé ne suit plus',
        text: 'Le plan posé au planning mène au 11/04 ; Marathon de Paris est maintenant le 25/04.',
        repose: 'm1',
        clear: false,
        leaving: 12,
      },
    };
    renderPlan();
    expect(await screen.findByText(/mène au 11\/04/)).toBeInTheDocument();
    // La date (M-17) : reposer seulement — le serveur n'offre pas le retrait.
    expect(screen.queryByRole('button', { name: 'Retirer le plan' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Reposer le plan' }));
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Remplacer les séances posées ?' }));
    await waitFor(() => {
      expect(
        calls.some((call) => call.method === 'POST' && call.url === '/api/races/plan/m1'),
      ).toBe(true);
    });
  });

  it('passée en B : reposer et retirer, chacun armé, sur la course que le serveur nomme', async () => {
    list = {
      ...LIST,
      stale_plan: {
        reason: 'priority',
        race_id: 'm1',
        title: 'Le plan posé ne suit plus',
        text: 'Marathon de Paris est en priorité B. Dans les deux cas : 12 séances à venir partent ; les 3 passées restent.',
        repose: 'm2',
        clear: true,
        leaving: 12,
      },
    };
    renderPlan();
    expect(await screen.findByText(/les 3 passées restent/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retirer le plan' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    // Un seul geste armé, et seul à l'écran : l'autre revient avec « Annuler ».
    expect(screen.queryByRole('button', { name: 'Reposer le plan' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reposer le plan' }));
    expect(screen.queryByRole('button', { name: 'Retirer le plan' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remplacer les séances posées ?' }));
    await waitFor(() => {
      expect(
        calls.some((call) => call.method === 'POST' && call.url === '/api/races/plan/m2'),
      ).toBe(true);
    });
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('retirée : seulement « Retirer les séances posées », armé', async () => {
    list = {
      ...LIST,
      stale_plan: {
        reason: 'removed',
        race_id: null,
        title: 'Un plan sans course',
        text: 'Le plan posé pour Semi de Lyon reste au planning, mais aucune course visée ne le porte plus.',
        repose: null,
        clear: true,
        leaving: 12,
      },
    };
    renderPlan();
    expect(await screen.findByRole('heading', { name: 'Un plan sans course' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reposer le plan' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Retirer les séances posées' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Retirer les 12 séances ?' }));
    await waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE' && call.url === '/api/races/plan')).toBe(
        true,
      );
    });
  });

  it('ne montre aucun bandeau quand le serveur n’en dit rien', async () => {
    renderPlan();
    expect(await screen.findByText('6 km EF + 6 × 80 m LD')).toBeInTheDocument();
    expect(screen.queryByText('Le plan posé ne suit plus')).toBeNull();
  });
});
