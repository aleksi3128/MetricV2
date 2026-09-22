/**
 * La page « Toutes tes courses » (`ACT-20`, `docs/analyse-course.md`).
 *
 * Les chiffres sont servis **tels que le serveur les rend** — records, progressions,
 * semaines. Un test qui les recalculerait côté écran validerait exactement ce que
 * l'invariant interdit.
 *
 * Ce que ces tests gardent surtout, c'est ce que la page **ne dit pas** : un record sur les
 * seules sorties `.fit` qui passerait pour un record de tout l'historique, une semaine vide
 * qui disparaîtrait de la courbe, un bouton de réanalyse qui reviendrait sans raison.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { createQueryClient } from '@/lib/query';

import { Runs } from './activity/Runs';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

function run(id: number, date: string, distance: number, minutes: number, splits = 0) {
  return {
    id,
    token: `t${String(id)}`,
    date,
    distance_km: distance,
    duration_min: minutes,
    pace_min_km: Math.round((minutes / distance) * 1000) / 1000,
    speed_kmh: Math.round((60 / (minutes / distance)) * 100) / 100,
    avg_hr: null,
    elevation_m: null,
    cadence_spm: null,
    note: null,
    source: splits > 0 ? 'apple' : 'manual',
    run_id: splits > 0 ? 'a1b2c3' : '',
    active_calories: null,
    total_calories: null,
    start_time: null,
    end_time: null,
    split_length_km: null,
    splits,
    fit_path: splits > 0 ? `2026/08/21/20260821-194000-${String(id).padStart(8, '0')}.fit` : '',
    max_hr: null,
    rpe: null,
  };
}

/** Six sorties sur trois mois, la plus récente d'abord — comme le serveur les rend. */
const PROGRESS = {
  runs: [
    run(5, '2026-08-21', 8.14, 40.983, 9),
    run(4, '2026-08-02', 8.0, 41.6),
    run(3, '2026-07-12', 12.0, 65.0),
    run(2, '2026-06-21', 10.2, 56.1),
    run(1, '2026-06-07', 5.2, 28.1),
    run(0, '2026-06-01', 3.2, 17.6),
  ],
  total_runs: 6,
  total_distance_km: 46.74,
  total_minutes: 249.4,
  overall_pace_min_km: 5.336,
  best_pace_min_km: 5.035,
  best_pace_index: 5,
  best_pace_day: '2026-08-21',
  longest_distance_km: 12.0,
  longest_distance_index: 3,
  longest_distance_day: '2026-07-12',
  longest_duration_min: 65.0,
  bands: [
    {
      label: 'Moins de 5 km',
      runs: 1,
      best_pace_min_km: 5.5,
      best_index: 0,
      best_day: '2026-06-01',
      average_pace_min_km: 5.5,
      total_distance_km: 3.2,
    },
    {
      label: '5 à 10 km',
      runs: 3,
      best_pace_min_km: 5.035,
      best_index: 5,
      best_day: '2026-08-21',
      average_pace_min_km: 5.2,
      total_distance_km: 21.34,
    },
    {
      label: '10 km et plus',
      runs: 2,
      best_pace_min_km: 5.417,
      best_index: 3,
      best_day: '2026-07-12',
      average_pace_min_km: 5.46,
      total_distance_km: 22.2,
    },
  ],
  months: [
    { month: '2026-06', runs: 3, distance_km: 18.6, minutes: 101.8, pace_min_km: 5.473 },
    { month: '2026-07', runs: 1, distance_km: 12.0, minutes: 65.0, pace_min_km: 5.417 },
    { month: '2026-08', runs: 2, distance_km: 16.14, minutes: 82.583, pace_min_km: 5.117 },
  ],
  window: {
    size: 3,
    recent_pace_min_km: 5.117,
    previous_pace_min_km: 5.473,
    pace_delta_s_per_km: -21.4,
    recent_distance_km: 9.38,
    previous_distance_km: 6.2,
    distance_delta_km: 3.18,
  },
  pace_domain_min_km: [5.5, 5.035],
  volume_domain_km: [12.0, 18.6],
  distance_domain_km: [3.2, 12.0],
  records: [
    {
      distance_m: 1000,
      label: '1 km',
      duration_s: 281,
      pace_min_km: 4.683,
      day: '2026-08-21',
      run: 5,
      runs: 2,
    },
    {
      distance_m: 5000,
      label: '5 km',
      duration_s: 1510,
      pace_min_km: 5.033,
      day: '2026-08-21',
      run: 5,
      runs: 1,
    },
  ],
  effort_series: [
    {
      distance_m: 400,
      label: '400 m',
      marks: [
        { day: '2026-08-02', run: 4, duration_s: 124, pace_min_km: 5.167, record: false },
        { day: '2026-08-21', run: 5, duration_s: 105, pace_min_km: 4.375, record: true },
      ],
      pace_domain_min_km: [5.167, 4.375],
    },
    {
      distance_m: 1000,
      label: '1 km',
      marks: [
        { day: '2026-08-02', run: 4, duration_s: 336, pace_min_km: 5.6, record: false },
        { day: '2026-08-21', run: 5, duration_s: 281, pace_min_km: 4.683, record: true },
      ],
      pace_domain_min_km: [5.6, 4.683],
    },
  ],
  efforts_pending: 0,
  weeks: [
    { week: '2026-08-03', runs: 1, distance_km: 8.0, minutes: 41.6 },
    { week: '2026-08-10', runs: 0, distance_km: 0, minutes: 0 },
    { week: '2026-08-17', runs: 1, distance_km: 8.14, minutes: 40.983 },
  ],
  week_domain_km: [0, 8.14],
};

/** Une première sortie : rien à comparer, et la page ne doit rien inventer. */
const ALONE = {
  ...PROGRESS,
  runs: [PROGRESS.runs[0]],
  total_runs: 1,
  total_distance_km: 8.14,
  total_minutes: 40.983,
  months: [{ month: '2026-08', runs: 1, distance_km: 8.14, minutes: 40.983, pace_min_km: 5.035 }],
  window: {
    size: 0,
    recent_pace_min_km: null,
    previous_pace_min_km: null,
    pace_delta_s_per_km: null,
    recent_distance_km: null,
    previous_distance_km: null,
    distance_delta_km: null,
  },
};

const EMPTY = {
  ...PROGRESS,
  runs: [],
  total_runs: 0,
  total_distance_km: 0,
  total_minutes: 0,
  overall_pace_min_km: null,
  best_pace_min_km: null,
  best_pace_index: null,
  bands: [],
  months: [],
  window: ALONE.window,
  records: [],
  effort_series: [],
  weeks: [],
  week_domain_km: null,
};

const calls: { url: string; method: string }[] = [];

/** La charge et les corrélations, telles que le serveur les rend — rédigées. */
const TRENDS = {
  load: {
    acute: 124,
    chronic_weekly: 80,
    ratio: 1.55,
    ratio_text:
      'Charge des 7 derniers jours : 1,6 fois ta moyenne des 4 semaines — au-dessus de 1,5, on ne fait plus que du facile.',
    easy_share: 0.12,
    moderate_share: 0.1,
    hard_share: 0.78,
    distribution_text:
      'Sur 14 jours : 12 % facile, 10 % modéré, 78 % dur. Moins de 70 % de facile : la prochaine sortie est facile.',
    last_hard: '2026-09-19',
    unmeasured: 0,
    weeks: [
      { start: '2026-09-07', load: 60, runs: 2, share: 0.48 },
      { start: '2026-09-14', load: 124, runs: 3, share: 1 },
    ],
  },
  correlations: [
    {
      key: 'strength_48h',
      label: 'Séance Cadence dans les 48 h',
      status: 'pending',
      text: 'Séance Cadence dans les 48 h — 1 sortie comparable, 10 nécessaires, dont 5 de chaque côté.',
      n_high: 0,
      n_low: 1,
      effect_pct: null,
    },
    {
      key: 'calories_prev',
      label: 'Calories de la veille',
      status: 'shown',
      text: 'Calories de la veille — au-dessus de 2 200 kcal, ton efficacité est 4 % meilleure (au-dessus de 2 200 kcal (6 sorties) contre en dessous (6)). Observé, pas prouvé : une corrélation n’est pas une cause.',
      n_high: 6,
      n_low: 6,
      effect_pct: 4,
    },
  ],
};

function stub(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.includes('/efforts/rebuild')) {
        return Promise.resolve(json(200, { runs: 3, efforts: 10, splits: 16 }));
      }
      if (url.includes('/runs/trends')) return Promise.resolve(json(200, TRENDS));
      return Promise.resolve(json(status, body));
    }),
  );
}

function renderRuns() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/activite/courses']}>
        <Toaster>
          <Routes>
            <Route path="/activite/courses" element={<Runs />} />
          </Routes>
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  localStorage.setItem('metric.token', 'jeton');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('page Toutes tes courses', () => {
  it('dit ce que coûte le prochain geste plutôt que d’afficher des zéros', async () => {
    stub(EMPTY);
    renderRuns();

    expect(await screen.findByText('Aucune course enregistrée')).toBeInTheDocument();
    // Pas de « 0 km » ni de « 0:00 » : rien n'a été couru, ce n'est pas une mesure.
    expect(screen.queryByText('Allure totale')).not.toBeInTheDocument();
  });

  it('dit que les records ne portent que sur les sorties importées d’un fichier', async () => {
    stub(PROGRESS);
    renderRuns();

    const table = await screen.findByRole('table', {
      name: 'Le meilleur temps de toutes tes sorties sur chaque distance',
    });
    // 4:41 deux fois : le temps et l'allure d'un kilomètre sont le même nombre.
    expect(within(table).getAllByText('4:41')).toHaveLength(2);
    // Sans la phrase, une sortie saisie plus rapide que « 5 km en 25:10 » ferait mentir
    // le record.
    expect(screen.getByText(/Sur tes sorties importées d’un fichier \.fit/)).toBeInTheDocument();
  });

  it('mène de chaque record à la sortie qui le détient', async () => {
    stub(PROGRESS);
    renderRuns();

    const table = await screen.findByRole('table', {
      name: 'Le meilleur temps de toutes tes sorties sur chaque distance',
    });
    expect(within(table).getByRole('link', { name: /^1 km/ })).toHaveAttribute(
      'href',
      '/activite/course/5',
    );
    // Le nombre de sorties qui couvrent la distance : un record parmi une n'en est pas un.
    expect(within(table).getByRole('link', { name: /^5 km/ })).toHaveTextContent('1 sortie');
  });

  it('trace la progression du kilomètre d’abord, et laisse choisir une autre distance', async () => {
    stub(PROGRESS);
    renderRuns();

    expect(
      await screen.findByRole('heading', { name: 'Ton meilleur 1 km de chaque sortie' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '400 m' }));
    expect(
      screen.getByRole('heading', { name: 'Ton meilleur 400 m de chaque sortie' }),
    ).toBeInTheDocument();
  });

  it('garde les semaines vides dans le volume', async () => {
    stub(PROGRESS);
    renderRuns();

    // Une semaine sans course au milieu d'un entraînement **est** l'information.
    expect(await screen.findByText('10/08')).toBeInTheDocument();
    expect(screen.getByText('0 km')).toBeInTheDocument();
  });

  it('ne propose de réanalyser que tant qu’il reste des sorties à rattraper', async () => {
    stub(PROGRESS);
    renderRuns();

    await screen.findByText('Sorties');
    expect(screen.queryByText(/à réanalyser/)).not.toBeInTheDocument();
  });

  it('réanalyse les sorties d’avant les efforts, d’un appui', async () => {
    stub({ ...PROGRESS, efforts_pending: 3 });
    renderRuns();

    expect(await screen.findByText('3 sorties à réanalyser')).toBeInTheDocument();
    // Une addition rejouable, pas une destruction : un seul appui.
    await userEvent.click(screen.getByRole('button', { name: 'Réanalyser les sorties' }));

    await waitFor(() => {
      expect(
        calls.some((call) => call.url.includes('/efforts/rebuild') && call.method === 'POST'),
      ).toBe(true);
    });
    expect(await screen.findByText('3 sorties réanalysées.')).toBeInTheDocument();
  });

  it('mène de chaque ligne au détail de sa course', async () => {
    stub(PROGRESS);
    renderRuns();

    const list = await screen.findByRole('table', {
      name: 'Toutes les courses, la plus récente d’abord',
    });
    const row = within(list).getByRole('link', { name: /21\/08/ });
    expect(row).toHaveAttribute('href', '/activite/course/5');
  });

  it('marque la meilleure allure et les courses importées d’un fichier', async () => {
    stub(PROGRESS);
    renderRuns();

    const list = await screen.findByRole('table', {
      name: 'Toutes les courses, la plus récente d’abord',
    });
    const best = within(list).getByRole('link', { name: /21\/08/ });
    // L'étoile vient du serveur (`best_pace_index`), pas d'une comparaison faite ici.
    expect(best).toHaveTextContent('★');
    expect(best).toHaveTextContent('.fit');

    const plain = within(list).getByRole('link', { name: /02\/08/ });
    expect(plain).not.toHaveTextContent('.fit');
  });

  it('dit la panne au lieu de laisser la page vide', async () => {
    // Une erreur **non transitoire** : `storage_unavailable` et tout `5xx` sont rejoués
    // deux fois par `shouldRetry`, et la temporisation dépasse l'attente d'un `findBy`.
    stub({ code: 'validation_failed', message: 'Requête invalide.' }, 422);
    renderRuns();

    expect(await screen.findByText('Courses indisponibles')).toBeInTheDocument();
    // Le message vient du serveur et s'affiche tel quel : le client décide sur le code.
    expect(screen.getByText('Requête invalide.')).toBeInTheDocument();
  });
});

describe('Toutes tes courses — la charge et ce qui va avec une bonne sortie', () => {
  it('écrit la charge et la répartition telles que le serveur les rédige', async () => {
    stub(PROGRESS);
    renderRuns();

    expect(
      await screen.findByText(/au-dessus de 1,5, on ne fait plus que du facile/),
    ).toBeInTheDocument();
    const shares = screen.getByRole('list', { name: 'Répartition de l’intensité sur 14 jours' });
    expect(shares).toHaveTextContent('Facile');
    expect(shares).toHaveTextContent('78 %');
    expect(screen.getByText(/Dernière séance dure : samedi 19 septembre/)).toBeInTheDocument();
  });

  it('met les constats passés d’abord, et replie ceux qui attendent', async () => {
    stub(PROGRESS);
    renderRuns();

    const list = await screen.findByRole('list', { name: 'Ce qui va avec tes bonnes sorties' });
    expect(list.querySelectorAll('li')).toHaveLength(1);
    expect(list).toHaveTextContent('Observé, pas prouvé');
    // Ce qui attend se replie sous une ligne qui le compte.
    expect(screen.getByText('1 facteur en attente de sorties comparables')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Facteurs en attente' })).toHaveTextContent(
      '10 nécessaires, dont 5 de chaque côté',
    );
  });
});
