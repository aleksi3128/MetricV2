/**
 * Les douleurs à l'écran (`docs/douleurs.md`).
 *
 * Le serveur juge ; l'écran affiche sa phrase et choisit un ton de badge. Ce que ces cas
 * vérifient, c'est surtout ce que l'écran **ne** fait **pas** : pré-sélectionner une
 * pastille, préremplir une base, ou répondre « non » à la place de l'utilisateur.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { Run } from '@/features/activity/api';
import type { PainEpisode, PainView, PatternsView } from '@/features/pain/api';
import { createQueryClient } from '@/lib/query';

import { PainSection } from './body/Pain';
import { PainCheck } from './body/PainCheck';
import { PainLink } from './body/PainLink';
import { Pains } from './body/Pains';

const posted: { url: string; method: string; body: unknown }[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const EPISODE: PainEpisode = {
  pain_id: 'p1',
  zone: 'Achille',
  side: 'right',
  place: '(Achille, droit)',
  title: 'Achille · droit',
  baseline: 1,
  opened: '2026-10-18',
  last_intensity: 3,
  last_date: '2026-10-18',
  status: 'adapt',
  text: 'Gêne (Achille, droit), 3/10 pour une base à 1. Séance adaptée.',
  closed_on: null,
  due_today: true,
  reports: [
    {
      id: 0,
      token: 't0',
      pain_id: 'p1',
      date: '2026-10-18',
      report: 'pain',
      zone: 'Achille',
      side: 'right',
      intensity: 3,
      baseline: 1,
      moment: 'after',
      kind: 'dull',
      limp: false,
      run_id: null,
      note: null,
      source: 'import',
      summary: '3/10 · après · sourde',
    },
  ],
};

function view(overrides: Partial<PainView> = {}): PainView {
  return {
    today: '2026-10-19',
    open: [],
    closed: [],
    none: [],
    zones: [],
    baselines: {},
    ...overrides,
  };
}

let current: PainView = view();
let patterns: PatternsView = { zones: [], unanswered: [] };

beforeEach(() => {
  posted.length = 0;
  current = view();
  patterns = { zones: [], unanswered: [] };
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
        if (url.endsWith('/api/pain/none')) return Promise.resolve(json(201, {}));
        return Promise.resolve(json(201, EPISODE));
      }
      if (url.endsWith('/api/pain/patterns')) return Promise.resolve(json(200, patterns));
      return Promise.resolve(json(200, current));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWith(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>{node}</Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const RUN = { id: 4, run_id: 'r42', date: '2026-10-19', token: 'tr' } as Run;

describe('la section Douleurs', () => {
  it('dit ce que coûte le premier geste quand rien n’est noté', async () => {
    renderWith(<PainSection />);

    expect(await screen.findByText('Aucune douleur notée')).toBeInTheDocument();
  });

  it('affiche la phrase du serveur et son état, sans la réécrire', async () => {
    current = view({ open: [EPISODE] });
    renderWith(<PainSection />);

    expect(await screen.findByText(EPISODE.text)).toBeInTheDocument();
    expect(screen.getByText('séance adaptée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Noter aujourd’hui' })).toBeInTheDocument();
  });

  it('ne pré-sélectionne rien, et dit ce qui manque avant d’écrire', async () => {
    renderWith(<PainSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Noter une douleur' }));

    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Noter la douleur' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Il manque la zone');
    expect(posted).toHaveLength(0);
  });

  it('rappelle la dernière base d’une zone en phrase, sans la poser dans le champ', async () => {
    current = view({ zones: ['Achille'], baselines: { achille: 2 } });
    renderWith(<PainSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Noter une douleur' }));

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Zones déjà notées' })).getByRole('button', {
        name: 'Achille',
      }),
    );

    expect(screen.getByText('Dernière base notée pour cette zone : 2/10.')).toBeInTheDocument();
    const base = screen.getByRole('group', { name: 'Base, de 0 à 10' });
    expect(within(base).getByRole('button', { name: '2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('écrit une douleur complète au jour du serveur', async () => {
    renderWith(<PainSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Noter une douleur' }));

    await userEvent.type(screen.getByLabelText('Où ?'), 'Genou');
    await userEvent.click(screen.getByRole('button', { name: 'Gauche' }));
    const intensity = screen.getByRole('group', { name: 'Intensité, de 0 à 10' });
    await userEvent.click(within(intensity).getByRole('button', { name: '7' }));
    const base = screen.getByRole('group', { name: 'Base, de 0 à 10' });
    await userEvent.click(within(base).getByRole('button', { name: '0' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pendant' }));
    await userEvent.click(screen.getByRole('button', { name: 'Vive' }));
    await userEvent.click(screen.getByRole('button', { name: 'Noter la douleur' }));

    await vi.waitFor(() => {
      expect(posted).toHaveLength(1);
    });
    expect(posted[0]?.body).toMatchObject({
      date: '2026-10-19',
      pain_id: null,
      zone: 'Genou',
      side: 'left',
      intensity: 7,
      baseline: 0,
      moment: 'during',
      kind: 'sharp',
      limp: false,
      source: 'manual',
    });
  });
});

describe('la porte des douleurs, en tête de /corps (M-08)', () => {
  it('mène à la sous-page et dit qu’aucune douleur n’est en cours', async () => {
    renderWith(<PainLink />);

    expect(await screen.findByText('Aucune douleur en cours.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Douleurs/ })).toHaveAttribute(
      'href',
      '/corps/douleurs',
    );
  });

  it('nomme l’épisode ouvert, son état servi, et le suivi dû', async () => {
    current = view({ open: [EPISODE], closed: [{ ...EPISODE, pain_id: 'p0', status: 'closed' }] });
    renderWith(<PainLink />);

    const link = await screen.findByRole('link', { name: /Achille · droit/ });
    expect(within(link).getByText('séance adaptée')).toBeInTheDocument();
    expect(within(link).getByText('suivi à noter aujourd’hui')).toBeInTheDocument();
    // Une douleur refermée ne s'annonce pas en tête d'écran.
    expect(within(link).queryByText('refermée')).toBeNull();
  });

  it('reste une porte quand la lecture échoue, et dit pourquoi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(json(422, { code: 'validation_failed', message: 'Douleurs illisibles.' })),
      ),
    );
    renderWith(<PainLink />);

    const link = await screen.findByRole('link', { name: /Douleurs illisibles\./ });
    expect(link).toHaveAttribute('href', '/corps/douleurs');
  });
});

describe('la sous-page /corps/douleurs (M-08)', () => {
  it('porte son titre, son retour, et range les épisodes en cours et refermés', async () => {
    current = view({ open: [EPISODE], closed: [{ ...EPISODE, pain_id: 'p0', status: 'closed' }] });
    renderWith(<Pains />);

    expect(screen.getByRole('heading', { level: 1, name: 'Douleurs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour au corps' })).toHaveAttribute('href', '/corps');
    expect(await screen.findByText('En cours')).toBeInTheDocument();
    expect(screen.getByText('Refermées')).toBeInTheDocument();
  });
});

describe('ce qui va avec une douleur', () => {
  it('affiche le constat établi et ce qui n’y joue pas, puis demande les sorties sans réponse', async () => {
    current = view({ closed: [{ ...EPISODE, status: 'closed' }] });
    patterns = {
      zones: [
        {
          key: 'bord externe pied|right',
          title: 'Bord externe du pied · droit',
          place: '(Bord externe du pied, droit)',
          with_pain: 5,
          without: 7,
          findings: [
            {
              factor: 'pace',
              status: 'shown',
              text: 'La douleur est apparue sur 5 des 5 sorties plus rapides que 5’45/km.',
            },
            {
              factor: 'cadence',
              status: 'neutral',
              text: 'La cadence n’y joue pas : 172 pas/min en moyenne avec douleur, 172 sans.',
            },
          ],
          pending_text: '',
        },
      ],
      unanswered: [{ run_id: 'r9', date: '2026-10-12', detail: 'Course · 40 min · 7,0 km' }],
    };
    renderWith(<PainSection />);

    expect(
      await screen.findByText(
        'La douleur est apparue sur 5 des 5 sorties plus rapides que 5’45/km.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/La cadence n’y joue pas/)).toBeInTheDocument();
    expect(screen.getByText('12/10/2026 · Course · 40 min · 7,0 km')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Non' }));
    await vi.waitFor(() => {
      expect(posted[0]).toMatchObject({
        url: '/api/pain/none',
        body: { date: '2026-10-12', run_id: 'r9' },
      });
    });
  });
});

describe('la question à la fin d’un import', () => {
  it('écrit le « non » pour la sortie, en un appui', async () => {
    const done = vi.fn();
    renderWith(
      <PainCheck date={RUN.date} activityId={RUN.run_id} today="2026-10-19" onDone={done} />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Non' }));

    await vi.waitFor(() => {
      expect(done).toHaveBeenCalled();
    });
    expect(posted[0]).toMatchObject({
      url: '/api/pain/none',
      body: { date: '2026-10-19', run_id: 'r42' },
    });
  });

  it('« Plus tard » n’écrit rien', async () => {
    const done = vi.fn();
    renderWith(
      <PainCheck date={RUN.date} activityId={RUN.run_id} today="2026-10-19" onDone={done} />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Plus tard' }));

    expect(done).toHaveBeenCalled();
    expect(posted).toHaveLength(0);
  });

  it('« Oui » ouvre le relevé, rattaché à la sortie', async () => {
    renderWith(
      <PainCheck date={RUN.date} activityId={RUN.run_id} today="2026-10-19" onDone={vi.fn()} />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Oui' }));

    expect(await screen.findByLabelText('Où ?')).toBeInTheDocument();
  });
});
