/**
 * Import d'une sortie par un fichier `.fit` (`docs/import-fit.md`).
 *
 * Deux surfaces, et elles n'ont pas le même contrat. La **feuille** écrit directement
 * (**F5**) : ce qui se teste ici, c'est qu'aucun formulaire ne s'interpose, et qu'un refus
 * du serveur reste lisible au lieu de passer en toast. La **page Course** affiche l'analyse
 * (`docs/analyse-course.md`) : ce qui se teste, c'est qu'elle ne la demande que quand un
 * fichier existe, et qu'un fichier sans position n'y dessine pas de cadre vide.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { createQueryClient } from '@/lib/query';

import { Run } from './activity/Run';
import { NewActivitySheet } from './activity/NewActivitySheet';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

/** Une course importée, telle que le serveur la rend après écriture. */
const IMPORTED = {
  id: 0,
  token: 'tok',
  date: '2026-09-11',
  distance_km: 5.076,
  duration_min: 29.817,
  pace_min_km: 5.874,
  speed_kmh: 10.21,
  avg_hr: null,
  elevation_m: 6,
  cadence_spm: 164,
  note: null,
  source: 'fit',
  run_id: 'ab12cd',
  active_calories: null,
  total_calories: null,
  start_time: '06:59:22',
  end_time: '07:29:11',
  split_length_km: 1,
  splits: 6,
  fit_path: '2026/09/11/20260911-065922-deadbeef.fit',
  max_hr: null,
};

const EMPTY_SPLITS = {
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

/** Une analyse minimale : un carré parcouru, sans constat ni zone. */
function analysis(located: boolean) {
  const corners = [
    [0, 1],
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  return {
    points: corners.map(([x, y], index) => ({
      distance_km: index * 1.25,
      timer_s: index * 450,
      pace_min_km: 5.874,
      pace_class: 'even',
      heart_rate: null,
      cadence_spm: null,
      altitude_m: null,
      x: located ? x : null,
      y: located ? y : null,
    })),
    located,
    width: 1,
    height: 1,
    distance_ticks_km: [0, 1, 2, 3, 4, 5],
    pace_domain_min_km: [6, 5.7],
    pace_ticks_min_km: [5.75, 6],
    heart_rate_domain: null,
    cadence_domain: null,
    altitude_domain_m: null,
    average_pace_min_km: 5.874,
    moving_pace_min_km: null,
    paused_s: 0,
    stopped_s: 0,
    stops: [],
    class_threshold_s: 10,
    insights: [],
    efforts: [],
    zones: null,
    zones_missing: 'Pas de zones sans allure seuil.',
  };
}

const calls: string[] = [];

function stub(handler: (url: string, init?: RequestInit) => Response): ReturnType<typeof vi.fn> {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(input as string);
    return Promise.resolve(handler(input as string, init));
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── La feuille ────────────────────────────────────────

function renderSheet(onClose = vi.fn()): { onClose: ReturnType<typeof vi.fn> } {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>
          <NewActivitySheet open today="2026-09-11" onClose={onClose} />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onClose };
}

async function chooseFit(): Promise<void> {
  await screen.findByText('importer un fichier .fit');
  const input = document.querySelector('#run-fit') as HTMLInputElement;
  await userEvent.upload(input, new File(['fit'], 'Morning.fit', { type: '' }));
}

describe('ajouter une sortie par un .fit', () => {
  it('écrit la course sans passer par le formulaire, et referme', async () => {
    const mock = stub((url) => {
      if (url.includes('/api/ai/status')) return json(200, { enabled: true, message: 'ok' });
      if (url.includes('/api/activity/runs/fit')) return json(201, IMPORTED);
      return json(200, {});
    });
    const { onClose } = renderSheet();

    await chooseFit();

    await waitFor(() => {
      expect(calls.some((url) => url.includes('/api/activity/runs/fit'))).toBe(true);
    });
    // Un envoi multipart : le fichier part tel quel, aucun champ n'est recopié en route.
    const sent = mock.mock.calls.find(([url]) => String(url).includes('/runs/fit'));
    expect((sent?.[1] as RequestInit | undefined)?.body).toBeInstanceOf(FormData);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('affiche le refus du serveur dans la feuille, pas en toast', async () => {
    // « Cette sortie est déjà enregistrée » se lit et se relit : un toast qui s'efface
    // obligerait à refaire l'import pour savoir ce qui a cloché.
    stub((url) => {
      if (url.includes('/api/ai/status')) return json(200, { enabled: true, message: 'ok' });
      if (url.includes('/api/activity/runs/fit')) {
        return json(422, {
          code: 'validation_error',
          message: 'Cette sortie est déjà enregistrée : le 11/09 à 06:59, 5,1 km.',
        });
      }
      return json(200, {});
    });
    const { onClose } = renderSheet();

    await chooseFit();

    const refusal = await screen.findByRole('alert');
    expect(refusal).toHaveTextContent('déjà enregistrée');
    // Rien n'est fermé : la feuille reste ouverte sur son message.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reste proposé quand la lecture de capture ne l’est pas', async () => {
    // L'import .fit est du décodage, pas un modèle : il ne dépend d'aucune clé.
    stub((url) => {
      if (url.includes('/api/ai/status')) {
        return json(200, { enabled: false, message: 'clé absente' });
      }
      return json(200, {});
    });
    renderSheet();

    expect(await screen.findByText('importer un fichier .fit')).toBeInTheDocument();
    expect(screen.queryByText('choisir une capture d’écran')).not.toBeInTheDocument();
  });
});

// ── La page Course ────────────────────────────────────

function renderRun(): void {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/activite/course']}>
        <Routes>
          <Route path="/activite/course" element={<Run />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('l’analyse d’une course importée', () => {
  it('dessine le parcours et propose le fichier', async () => {
    stub((url) => {
      if (url.includes('/analysis')) return json(200, analysis(true));
      return json(200, { run: IMPORTED, splits: EMPTY_SPLITS, context: CONTEXT });
    });
    renderRun();

    expect(await screen.findByRole('img', { name: /Parcours de la course/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Récupérer le fichier .fit' })).toBeInTheDocument();
  });

  it('ne demande pas de tracé à une course saisie au clavier', async () => {
    stub(() =>
      json(200, {
        run: { ...IMPORTED, source: 'manual', fit_path: '' },
        splits: EMPTY_SPLITS,
        context: CONTEXT,
      }),
    );
    renderRun();

    await screen.findByText('5,08');
    expect(calls.some((url) => url.includes('/analysis'))).toBe(false);
    expect(screen.queryByRole('img', { name: /Parcours/ })).not.toBeInTheDocument();
  });

  it('trace l’allure d’un fichier sans position, sans cadre vide pour le parcours', async () => {
    stub((url) => {
      if (url.includes('/analysis')) return json(200, analysis(false));
      return json(200, { run: IMPORTED, splits: EMPTY_SPLITS, context: CONTEXT });
    });
    renderRun();

    // Un tapis de course : la courbe existe, le parcours non — et rien ne ressemble à une
    // course sans parcours.
    expect(await screen.findByRole('img', { name: /Allure au fil/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Parcours/ })).not.toBeInTheDocument();
  });
});
