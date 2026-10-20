/**
 * La charge, la carte « Forme » et le respect de la séance (`docs/accueil-et-charge.md`).
 *
 * Le serveur compte et rédige ; ces cas vérifient que l'écran recopie ses phrases, que la
 * carte de l'accueil met les alertes d'abord, et qu'une sortie libre ne s'invente pas de
 * séance à respecter.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Run, RunAdherence } from '@/features/activity/api';
import type { TrainingView } from '@/features/training/api';
import { createQueryClient } from '@/lib/query';

import { Adherence } from './activity/run/Adherence';
import { Shape } from './dashboard/Shape';
import { Load } from './Load';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const TRAINING: TrainingView = {
  today: '2026-10-20',
  history_days: 60,
  ctl: 41.6,
  atl: 52.2,
  tsb: -10.6,
  form_text: 'Fraîcheur −11 : tu portes de la fatigue.',
  ratio: 1.2,
  ratio_text: 'Rapport de charge 1,20 : dans la zone.',
  monotony: 1.4,
  strain: 900,
  monotony_text: 'Monotonie 1,4 : semaine variée.',
  unrated: {},
  unrated_text: '',
  series: [
    { date: '2026-10-19', load: 300, ctl: 40, atl: 50, tsb: -9, pain: null },
    { date: '2026-10-20', load: 200, ctl: 41.6, atl: 52.2, tsb: -10.6, pain: 4 },
  ],
  weeks: [
    {
      start: '2026-10-19',
      minutes: { course: 120, vélo: 70 },
      load: 900,
      total_min: 190,
      share: 1,
      total_text: '3 h 10',
      sports_text: 'course 2 h, vélo 1 h 10',
    },
  ],
  findings: [],
  intensity: {
    easy: 0.74,
    moderate: 0.1,
    hard: 0.16,
    target: 0.8,
    unclassified_min: 0,
    text: 'Sur 28 jours, tous sports : 74 % facile — sous la cible de 80 % de facile.',
  },
  pain_stop: 7,
  load_domain: [40, 52.2],
};

function serve(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input as string;
      const hit = Object.keys(routes).find((path) => url.includes(path));
      if (hit === undefined) return Promise.resolve(json(404, { code: 'not_found', message: url }));
      const body = routes[hit];
      return Promise.resolve(
        body instanceof Error
          ? json(503, { code: 'storage_unavailable', message: body.message })
          : json(200, body),
      );
    }),
  );
}

function renderWith(node: React.ReactNode) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('l’écran de la charge', () => {
  it('recopie les phrases du serveur et range les parts servies', async () => {
    serve({ '/api/training': TRAINING });
    renderWith(<Load />);

    expect(await screen.findByText(TRAINING.form_text)).toBeInTheDocument();
    expect(screen.getByText(TRAINING.ratio_text)).toBeInTheDocument();
    expect(screen.getByText(TRAINING.intensity?.text ?? '')).toBeInTheDocument();
    expect(screen.getByText('3 h 10')).toBeInTheDocument();
    expect(screen.getByText('course 2 h, vélo 1 h 10')).toBeInTheDocument();
    expect(screen.getByText('74 %')).toBeInTheDocument();
  });

  it('dit la panne au lieu d’une charge vide', async () => {
    serve({ '/api/training': new Error('Nextcloud ne répond pas.') });
    renderWith(<Load />);

    expect(await screen.findByText('Nextcloud ne répond pas.')).toBeInTheDocument();
    expect(screen.queryByText('Forme et fatigue')).not.toBeInTheDocument();
  });
});

describe('la carte « Forme » de l’accueil', () => {
  it('met les alertes ouvertes d’abord, chacune vers sa page', async () => {
    serve({
      '/notifications/alerts': [
        {
          key: 'pain:achille',
          priority: 'critical',
          title: 'Douleur à 7',
          body: 'Arrête la course.',
          url: '/corps',
        },
      ],
      '/api/training': TRAINING,
      '/api/body/health': { days: [] },
    });
    renderWith(<Shape />);

    const alerts = await screen.findByRole('list', { name: 'Alertes ouvertes' });
    const link = within(alerts).getByRole('link');
    expect(link).toHaveAttribute('href', '/corps');
    expect(within(link).getByText('critique')).toBeInTheDocument();
    expect(await screen.findByText(TRAINING.form_text)).toBeInTheDocument();
    // Sans nuit reçue, rien : pas de promesse d'une synchro Garmin qui ne viendra pas.
    expect(screen.queryByText(/synchro Garmin/)).not.toBeInTheDocument();
  });

  it('une lecture en panne n’emporte pas les deux autres', async () => {
    serve({
      '/notifications/alerts': [],
      '/api/training': new Error('Charge en panne.'),
      '/api/body/health': {
        days: [{ date: '2026-10-20', text: '7 h 12 de sommeil (score 78)' }],
      },
    });
    renderWith(<Shape />);

    expect(await screen.findByText('Charge en panne.')).toBeInTheDocument();
    expect(await screen.findByText('7 h 12 de sommeil (score 78)')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Alertes ouvertes' })).not.toBeInTheDocument();
  });
});

describe('le respect de la séance prévue', () => {
  const RUN = { id: 3, run_id: 'r3', date: '2026-10-11' } as Run;

  it('ne dit rien quand rien n’était prévu', async () => {
    serve({ '/adherence': { planned: false } });
    const { container } = renderWith(<Adherence run={RUN} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('CA-04 : 5 km sur 5, phrase du serveur et badge', async () => {
    const adherence: RunAdherence = {
      planned: true,
      source: 'coach',
      title: 'Footing en endurance',
      judged_km: 5,
      in_range_km: 5,
      basis: 'pace',
      target: '6:00–6:20 /km',
      text: '5 km sur 5 dans la plage (6:00–6:20 /km). 32 min pour 31 prévues : la durée y est.',
      caveat: 'Plages rebâties depuis tes zones d’aujourd’hui.',
    };
    serve({ '/adherence': adherence });
    renderWith(<Adherence run={RUN} />);

    expect(await screen.findByText(adherence.text)).toBeInTheDocument();
    expect(screen.getByText('5/5 km')).toBeInTheDocument();
  });
});
