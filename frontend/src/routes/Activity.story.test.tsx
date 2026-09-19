/**
 * La feuille de story, depuis la page d'une sortie (`docs/story-course.md`).
 *
 * Le dessin lui-même est éprouvé ailleurs, sur un contexte qui note les appels
 * (`run/story.test.ts`) : jsdom n'a pas de canvas 2D, et un test qui le simulerait
 * validerait la simulation. Ce qui se joue **ici** est ce que jsdom sait dire —
 *
 * - le bouton existe sur la page, et la feuille ne se monte qu'à l'ouverture ;
 * - les réglages offerts dépendent de ce que la sortie porte : pas de tracé sans `.fit`,
 *   pas de masquage sur une sortie trop courte, et dans les deux cas **une phrase qui dit
 *   pourquoi** plutôt qu'une option morte ;
 * - l'image reste nommée pour qui ne la voit pas.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { createQueryClient } from '@/lib/query';

import { Run } from './activity/Run';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const RUN = {
  id: 3,
  token: 'W/"3"',
  date: '2026-09-13',
  distance_km: 8.14,
  duration_min: 47.2,
  pace_min_km: 5.798,
  speed_kmh: 10.35,
  avg_hr: null,
  elevation_m: 24,
  cadence_spm: 166,
  note: null,
  source: 'fit',
  run_id: 'r-3',
  active_calories: null,
  total_calories: null,
  start_time: '06:58:00',
  end_time: '07:45:00',
  split_length_km: 1,
  splits: 8,
  fit_path: '2026/09/13/x.fit',
  max_hr: null,
};

function point(index: number) {
  return {
    distance_km: index * 0.8,
    timer_s: index * 280,
    pace_min_km: 5.8,
    pace_class: index % 2 === 0 ? 'faster' : 'slower',
    heart_rate: null,
    cadence_spm: null,
    altitude_m: null,
    x: index / 10,
    y: (index % 3) / 3,
  };
}

const ANALYSIS = {
  points: Array.from({ length: 11 }, (_, index) => point(index)),
  located: true,
  width: 1,
  height: 0.8,
  distance_ticks_km: [0, 4, 8],
  pace_domain_min_km: [6.4, 5.1],
  pace_ticks_min_km: [5.5, 6],
  heart_rate_domain: null,
  cadence_domain: null,
  altitude_domain_m: null,
  average_pace_min_km: 5.798,
  moving_pace_min_km: null,
  paused_s: 0,
  stopped_s: 0,
  stops: [],
  class_threshold_s: 10,
  insights: [],
  efforts: [],
  zones: null,
  zones_missing: 'Aucune référence.',
};

/** Les paliers et le contexte, réduits à ce que la page exige : ni l'un ni l'autre n'est
 *  ce qu'on éprouve ici, mais la page les lit et tomberait sans eux. */
const SPLITS = {
  splits: [],
  full_count: 0,
  partial_count: 0,
  drift_s_per_km: null,
  first_half_pace_min_km: null,
  second_half_pace_min_km: null,
  fastest_index: null,
  slowest_index: null,
  pace_domain_min_km: null,
  cadence_max_spm: null,
  average_pace_min_km: null,
  fastest_pace_min_km: null,
  slowest_pace_min_km: null,
  pace_spread_s_per_km: null,
  pace_sd_s_per_km: null,
  negative_split: null,
  cadence_avg_spm: null,
  cadence_min_spm: null,
  cadence_drift_spm: null,
  stride_avg_m: null,
  stride_min_m: null,
  stride_max_m: null,
  deviation_max_s_per_km: null,
  cadence_deviation_max_spm: null,
};

const CONTEXT = {
  runs_compared: 1,
  pace_rank: null,
  distance_rank: null,
  best_pace_min_km: null,
  longest_distance_km: null,
  average_pace_min_km: null,
  average_distance_km: null,
  pace_delta_s_per_km: null,
  distance_delta_km: null,
  recent: [],
  pace_domain_min_km: null,
};

function serve(run: unknown = RUN) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input as string;
      if (url.includes('/analysis')) return Promise.resolve(json(200, ANALYSIS));
      return Promise.resolve(json(200, { run, splits: SPLITS, context: CONTEXT }));
    }),
  );
}

function renderRun() {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/activite/course/3']}>
        <Toaster>
          <Routes>
            <Route path="/activite/course/:id" element={<Run />} />
          </Routes>
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openSheet() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /faire une story/i }));
  return user;
}

beforeEach(() => {
  localStorage.setItem('metric.token', 'jeton');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la story d’une course', () => {
  it('ne monte la feuille qu’à l’ouverture', async () => {
    serve();
    renderRun();

    // Le bouton est là dès que la course est lue, la feuille non : elle tient un canvas de
    // 1080 × 1920 et une lecture du `.fit`.
    expect(await screen.findByRole('button', { name: /faire une story/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openSheet();
    expect(await screen.findByRole('dialog', { name: 'Une story' })).toBeInTheDocument();
  });

  it('offre l’encre, la couleur du tracé et le masquage des bouts', async () => {
    serve();
    renderRun();
    await openSheet();

    await screen.findByRole('dialog', { name: 'Une story' });
    expect(screen.getByRole('group', { name: 'Couleur de l’encre' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Couleur du tracé' })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Départ et arrivée du parcours' }),
    ).toBeInTheDocument();
  });

  it('nomme l’image pour qui ne la voit pas', async () => {
    serve();
    renderRun();
    await openSheet();

    // Le canvas est un `img` : sans nom, il n'est rien pour la synthèse vocale.
    const preview = await screen.findByRole('img', { name: /aperçu de l’image/i });
    expect(preview).toHaveAccessibleName(/8,14 kilomètres/);
    expect(preview).toHaveAccessibleName(/temps 47:12/);
  });

  it('n’offre les cinq teintes qu’une fois « Couleur » choisie', async () => {
    serve();
    renderRun();
    const user = await openSheet();

    await screen.findByRole('dialog', { name: 'Une story' });
    // Offertes en permanence, elles laisseraient croire qu'elles pilotent autre chose que
    // l'encre — et ajouteraient cinq cibles à une feuille qui en porte déjà six.
    expect(screen.queryByRole('group', { name: 'Teinte de l’encre' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Couleur' }));
    const strip = await screen.findByRole('group', { name: 'Teinte de l’encre' });
    // Chaque teinte porte son **nom** : un choix qui ne se lirait qu'à la couleur serait
    // illisible pour qui ne les distingue pas.
    for (const name of ['Bleu', 'Vert', 'Ambre', 'Rose', 'Violet']) {
      expect(within(strip).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('dit pourquoi les bouts ne se masquent pas sur une sortie trop courte', async () => {
    serve({ ...RUN, distance_km: 1.2 });
    renderRun();
    await openSheet();

    await screen.findByRole('dialog', { name: 'Une story' });
    // L'option ne s'offre pas — et surtout, elle ne s'offre pas **en silence**.
    expect(
      screen.queryByRole('group', { name: 'Départ et arrivée du parcours' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/trop courte pour masquer les 300/i)).toBeInTheDocument();
  });

  it('dit qu’une sortie sans fichier n’a pas de parcours', async () => {
    serve({ ...RUN, fit_path: '', source: 'manual' });
    renderRun();
    await openSheet();

    await screen.findByRole('dialog', { name: 'Une story' });
    expect(screen.getByText(/pas de parcours à tracer/i)).toBeInTheDocument();
    // Ni tracé, ni réglage de tracé : une case qui ne pilote rien est pire que son absence.
    expect(screen.queryByRole('group', { name: 'Couleur du tracé' })).not.toBeInTheDocument();
    // Mais l'image existe quand même, avec ses chiffres.
    expect(screen.getByRole('img', { name: /aperçu de l’image/i })).toBeInTheDocument();
  });

  it('se referme par son bouton nommé', async () => {
    serve();
    renderRun();
    const user = await openSheet();

    await screen.findByRole('dialog', { name: 'Une story' });
    await user.click(screen.getByRole('button', { name: /fermer « Une story »/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
