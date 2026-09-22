/**
 * La carte du coach (`docs/coach-course.md` §7).
 *
 * Ce qui compte ici est une frontière : l'explication **du modèle** porte `AiBlock`, celle
 * **des règles** ne le porte pas, et les cibles — calculées par le serveur — s'affichent
 * comme des faits dans les deux cas.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoachNext, CoachView } from '@/features/coach/api';
import { createQueryClient } from '@/lib/query';

import { CoachCard } from './coach/CoachCard';

function view(overrides: Partial<CoachView> = {}): CoachView {
  return {
    id: 'a1b2c3d4e5f6',
    status: 'proposed',
    date: '2026-09-21',
    time: '07:00',
    type: 'threshold',
    title: 'Fractionné au seuil — 3 × 8 min',
    duration_min: 50,
    source: 'model',
    rationale: 'Ta semaine est **facile** à 82 % : place au seuil.',
    steps: [
      {
        kind: 'warmup',
        label: 'Échauffement',
        duration_s: 900,
        distance_m: null,
        target: '121–140 bpm',
        hr_low: 121,
        hr_high: 140,
        pace_slow_min_km: null,
        pace_fast_min_km: null,
        repeat: null,
      },
      {
        kind: 'run',
        label: 'Bloc',
        duration_s: 480,
        distance_m: null,
        target: '162–181 bpm',
        hr_low: 162,
        hr_high: 181,
        pace_slow_min_km: null,
        pace_fast_min_km: null,
        repeat: 3,
      },
    ],
    frame: ['Séance dure le 19 sept. : pas d’autre avant le 21 sept., 48 h plus tard.'],
    adjusted: null,
    workout: true,
    plan_session_id: null,
    trigger_run_id: 'run19',
    ...overrides,
  };
}

let next: CoachNext = { current: view(), missing: null, pending: false };
const posted: string[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  posted.length = 0;
  next = { current: view(), missing: null, pending: false };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      if ((init?.method ?? 'GET') === 'POST') posted.push(url);
      if (url.endsWith('/accept')) {
        next = { ...next, current: view({ status: 'accepted', plan_session_id: 'p1' }) };
      }
      return Promise.resolve(json(200, next));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCard(forRun?: string) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CoachCard forRun={forRun} rule="Et maintenant" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('la carte du coach', () => {
  it('pose l’explication du modèle comme une proposition, et les cibles comme des faits', async () => {
    renderCard();

    expect(await screen.findByText('Fractionné au seuil — 3 × 8 min')).toBeInTheDocument();
    expect(screen.getByText('Proposé par l’assistant')).toBeInTheDocument();
    // Le gras est rendu, pas montré en astérisques.
    expect(screen.getByText('facile', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('162–181 bpm')).toBeInTheDocument();
    expect(screen.getByText('Bloc').closest('li')).toHaveTextContent('3 × Bloc · 8 min162–181 bpm');
    expect(screen.getByText('Le cadre de ce choix')).toBeInTheDocument();
  });

  it('ne marque pas comme proposé par l’assistant ce que les règles ont choisi', async () => {
    next = {
      current: view({ source: 'rules', rationale: 'Choisie par les règles. Vitesse : …' }),
      missing: null,
      pending: false,
    };
    renderCard();

    expect(await screen.findByText('Choisie par les règles. Vitesse : …')).toBeInTheDocument();
    expect(screen.queryByText('Proposé par l’assistant')).not.toBeInTheDocument();
  });

  it('accepte la séance au planning, puis le dit', async () => {
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: 'Accepter au planning' }));
    expect(await screen.findByText('Au planning, lundi 21 septembre.')).toBeInTheDocument();
    expect(posted).toContain('/api/coach/next/accept');
  });

  it('dit l’allègement du matin avant la séance', async () => {
    next = {
      current: view({
        type: 'easy',
        title: 'Footing en endurance',
        adjusted: 'Allégée ce matin. FC de repos 59, 9 au-dessus de ta référence (50).',
        workout: false,
      }),
      missing: null,
      pending: false,
    };
    renderCard();

    expect(await screen.findByText(/Allégée ce matin/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Fichier pour la montre' }),
    ).not.toBeInTheDocument();
  });

  it('dit que la suite se prépare, juste après un import', async () => {
    next = { current: null, missing: 'Le coach prépare la suite de ta sortie.', pending: true };
    renderCard('run19');

    expect(await screen.findByText('Le coach prépare la suite de ta sortie.')).toBeInTheDocument();
  });

  it('se tait sur la page d’une autre sortie, chargement compris', async () => {
    const { container } = renderCard('une-autre');

    // Rien pendant le chargement : ni intertitre ni squelette qui disparaîtraient ensuite.
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('propose d’en demander une quand il n’y en a pas', async () => {
    next = { current: null, missing: 'Importe ta prochaine sortie.', pending: false };
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: 'Demander une proposition' }));
    expect(posted).toContain('/api/coach/next/refresh');
  });

  it('ne propose pas de caler un jour sans course', async () => {
    next = {
      current: view({
        type: 'rest',
        title: 'Repos',
        duration_min: 0,
        steps: [],
        workout: false,
        source: 'rules',
        rationale: 'Le repos entre deux sorties fait partie de l’entraînement.',
        adjusted: 'Tu as couru la veille : pas de course aujourd’hui.',
      }),
      missing: null,
      pending: false,
    };
    renderCard();

    expect(await screen.findByText('Repos')).toBeInTheDocument();
    // Ni durée nulle, ni phrase écrite deux fois.
    expect(screen.queryByText(/0 min/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Tu as couru la veille/)).toHaveLength(1);
    expect(screen.getByText(/Le repos entre deux sorties/)).toBeInTheDocument();
    expect(screen.getByText('Rien à caler : c’est un jour sans course.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accepter au planning' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Autre proposition' })).toBeInTheDocument();
  });
});
