/**
 * Planifier une course (`docs/planifier-une-seance.md`, D1–D8).
 *
 * L'écran ne lit pas la notation : il montre ce que le serveur en a lu, et envoie le texte.
 * Une course en notation part **sans durée** — le serveur la déduit — et les visées
 * partent en nombres, la virgule du clavier comprise.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { PlanFormValues, RunProgram } from '@/features/planning/api';
import { createQueryClient } from '@/lib/query';

import { PlanSheet } from './PlanSheet';
import { EMPTY_FORM } from './shared';

const READ: RunProgram = {
  lines: [
    { depth: 0, kind: 'group', text: '5 × :' },
    { depth: 1, kind: 'block', text: '1 km — à 6:00 /km · 115–133 bpm' },
    { depth: 1, kind: 'block', text: '80 m ligne droite — à 3:30 /km · au-dessus de 173 bpm' },
  ],
  errors: [],
  notation: "5 × (1 km 6'00 + 80 m LD 3'30)",
  distance_m: 5400,
  duration_s: 1860,
  summary: '5,4 km · 31 min',
};

const TEMPLATES = [
  { type: 'easy', title: 'Footing en endurance', notation: "45' EF", duration_min: 45 },
  {
    type: 'threshold',
    title: 'Fractionné au seuil',
    notation: "15' EF + 3 × 8' T r2' + 10' RC",
    duration_min: 55,
  },
];

let coach: unknown = null;
const QUIET = { warnings: [], free_slot: null, free_text: null };
let guarded: unknown = QUIET;
let circuits: unknown = { circuits: [], linkable: true };

const sent: { url: string; body: unknown }[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  sent.length = 0;
  coach = null;
  guarded = QUIET;
  circuits = { circuits: [], linkable: true };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
      sent.push({ url, body });
      if (url.includes('/run/parse')) return Promise.resolve(json(200, READ));
      if (url.includes('/run/coach')) return Promise.resolve(json(200, coach));
      if (url.includes('/run/templates')) return Promise.resolve(json(200, TEMPLATES));
      if (url.includes('/activity/circuits')) return Promise.resolve(json(200, circuits));
      if (url.includes('/planning/check')) return Promise.resolve(json(200, guarded));
      return Promise.resolve(json(201, {}));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Harness() {
  const [values, setValues] = useState<PlanFormValues | null>({
    ...EMPTY_FORM,
    date: '2026-10-22',
  });
  return <PlanSheet values={values} editing={null} onChange={setValues} onDone={() => {}} />;
}

function renderSheet() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>
          <Harness />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('planifier une course', () => {
  it('montre la séance lue par le serveur, et l’envoie sans durée', async () => {
    const user = userEvent.setup();
    renderSheet();
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Course' }));
    await user.type(within(sheet).getByLabelText('Titre'), 'Lignes droites');
    await user.type(within(sheet).getByLabelText('Séance'), "5 x (1 km 6'00 + 80 m LD 3'30)");

    expect(
      await within(sheet).findByText('80 m ligne droite — à 3:30 /km · au-dessus de 173 bpm'),
    ).toBeInTheDocument();
    expect(within(sheet).getByText('5,4 km · 31 min')).toBeInTheDocument();

    await user.type(within(sheet).getByLabelText('Distance (km)'), '5,4');
    await user.type(within(sheet).getByLabelText('Chrono'), "31'00");
    await user.click(within(sheet).getByRole('button', { name: 'Planifier' }));

    await waitFor(() => {
      expect(sent.some((call) => call.url.endsWith('/api/planning/sessions'))).toBe(true);
    });
    const posted = sent.find((call) => call.url.endsWith('/api/planning/sessions'));
    expect(posted?.body).toMatchObject({
      kind: 'course',
      program: "5 x (1 km 6'00 + 80 m LD 3'30)",
      duration_min: null,
      distance_km: 5.4,
      goal_time: "31'00",
      rpe_goal: null,
    });
  });

  it('n’envoie aucune visée de course avec une autre nature', async () => {
    const user = userEvent.setup();
    renderSheet();
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Course' }));
    await user.type(within(sheet).getByLabelText('Distance (km)'), '10');
    await user.click(within(sheet).getByRole('button', { name: 'Muscu' }));
    await user.type(within(sheet).getByLabelText('Titre'), 'Haut');
    await user.click(within(sheet).getByRole('button', { name: 'Planifier' }));

    await waitFor(() => {
      expect(sent.some((call) => call.url.endsWith('/api/planning/sessions'))).toBe(true);
    });
    const posted = sent.find((call) => call.url.endsWith('/api/planning/sessions'));
    expect(posted?.body).toMatchObject({ kind: 'muscu', distance_km: null, program: null });
  });

  it('une séance-type écrit sa notation, et la durée repart à vide', async () => {
    const user = userEvent.setup();
    renderSheet();
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Course' }));
    await user.click(await within(sheet).findByRole('button', { name: 'Fractionné au seuil' }));

    expect(within(sheet).getByLabelText('Séance')).toHaveValue("15' EF + 3 × 8' T r2' + 10' RC");
    expect(within(sheet).getByLabelText('Titre')).toHaveValue('Fractionné au seuil');
    expect(within(sheet).getByLabelText('Durée (min)')).toHaveValue('');
  });

  it('reprend la séance du coach quand il en a une pour ce jour, et seulement alors', async () => {
    const user = userEvent.setup();
    coach = { title: 'Tempo', notation: "15' EF + 25' Z3 + 10' RC", duration_min: 50 };
    renderSheet();
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Course' }));
    await user.click(
      await within(sheet).findByRole('button', { name: 'Reprendre la séance du coach — Tempo' }),
    );
    expect(within(sheet).getByLabelText('Séance')).toHaveValue("15' EF + 25' Z3 + 10' RC");
  });

  it('le constructeur écrit un groupe répété, sans rien calculer', async () => {
    const user = userEvent.setup();
    renderSheet();
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Course' }));
    await user.click(within(sheet).getByRole('button', { name: 'Construire au doigt' }));

    await user.click(within(sheet).getByRole('button', { name: 'Répétitions : augmenter' }));
    await user.click(within(sheet).getByRole('button', { name: 'Répétitions : augmenter' }));
    await user.type(within(sheet).getByLabelText('Bloc 1 — quantité'), '1');
    await user.click(
      within(within(sheet).getByRole('group', { name: 'Unité du bloc 1' })).getByRole('button', {
        name: 'km',
      }),
    );
    await user.type(within(sheet).getAllByLabelText('Allure (/km)')[0] as HTMLElement, "6'00");
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter un bloc au groupe' }));
    await user.type(within(sheet).getByLabelText('Bloc 2 — quantité'), '80');
    await user.click(
      within(within(sheet).getByRole('group', { name: 'Unité du bloc 2' })).getByRole('button', {
        name: 'm',
      }),
    );
    await user.click(
      within(within(sheet).getByRole('group', { name: 'Sigle du bloc 2' })).getByRole('button', {
        name: 'LD',
      }),
    );
    await user.type(within(sheet).getAllByLabelText('Allure (/km)')[1] as HTMLElement, "3'30");
    await user.click(within(sheet).getByRole('button', { name: 'Écrire la séance' }));

    expect(within(sheet).getByLabelText('Séance')).toHaveValue("3 × (1 km 6'00 + 80 m LD 3'30)");
  });

  it('la muscu prend un circuit Cadence : titre, durée et circuit envoyé', async () => {
    const user = userEvent.setup();
    circuits = {
      linkable: true,
      circuits: [
        { circuit_id: 'c9', name: 'Haut du corps', estimated_duration_min: 37.6, exact: true },
      ],
    };
    renderSheet();
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Muscu' }));
    await user.click(await within(sheet).findByRole('button', { name: 'Haut du corps' }));
    expect(within(sheet).getByLabelText('Titre')).toHaveValue('Haut du corps');
    expect(within(sheet).getByLabelText('Durée (min)')).toHaveValue('38');

    await user.click(within(sheet).getByRole('button', { name: 'Planifier' }));
    await waitFor(() => {
      expect(sent.some((call) => call.url.endsWith('/api/planning/sessions'))).toBe(true);
    });
    const posted = sent.find((call) => call.url.endsWith('/api/planning/sessions'));
    expect(posted?.body).toMatchObject({ kind: 'muscu', circuit_id: 'c9', duration_min: 38 });
  });

  it('dit les avis sans rien bloquer, et prend le créneau libre d’un appui', async () => {
    const user = userEvent.setup();
    guarded = {
      warnings: [
        {
          key: 'adjacent',
          text: 'Une course est déjà prévue ou faite la veille : le coach ne fait jamais courir deux jours d’affilée.',
        },
      ],
      free_slot: '18:30',
      free_text: 'Libre à 18:30 d’après ton agenda, pour 45 min.',
    };
    renderSheet();
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Course' }));

    const notes = await within(sheet).findByRole('list', { name: 'Avant de planifier' });
    expect(notes).toHaveTextContent('la veille');
    expect(within(sheet).getByRole('button', { name: 'Planifier' })).toBeEnabled();

    await user.click(within(sheet).getByRole('button', { name: 'Prendre 18:30' }));
    expect(within(sheet).getByLabelText('Heure')).toHaveValue('18:30');
    const asked = sent.filter((call) => call.url.includes('/planning/check')).at(-1);
    expect(asked?.body).toMatchObject({ date: '2026-10-22', kind: 'course', session_id: null });
  });
});
