/**
 * Une capture lue dans la feuille « Course » (`IMP-01` → `IMP-06`, M-14).
 *
 * La carte « Import d'une capture » est partie : ce fichier reprend ses tests là où ils
 * comptent encore — ce que la feuille envoie, ce qu'elle dit, et qu'elle n'écrit rien à la
 * lecture. Les écritures se **comptent**, elles ne se devinent pas à l'écran.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { createQueryClient } from '@/lib/query';

import type * as ImageModuleShape from '@/lib/image';

import { NewActivitySheet } from './activity/NewActivitySheet';

type ImageModule = typeof ImageModuleShape;

/**
 * `reduceImage` est doublé : en jsdom, ni `createImageBitmap` ni le canevas n'existent, et
 * la vraie fonction mesurerait l'absence d'un moteur de rendu. On vérifie le contrat — la
 * capture est réduite, à la qualité qui garde les chiffres lisibles.
 */
vi.mock('@/lib/image', async () => {
  const real = await vi.importActual<ImageModule>('@/lib/image');
  return {
    ...real,
    reduceImage: vi.fn((file: File, options?: { quality?: number }) => {
      reductions.push(options?.quality);
      return Promise.resolve({
        file: new File(['x'], file.name.replace(/\.png$/, '.jpg'), { type: 'image/jpeg' }),
        reduced: true,
        readable: true,
      });
    }),
  };
});

const reductions: (number | undefined)[] = [];

interface Call {
  url: string;
  init: RequestInit | undefined;
}

const calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

/** Ce qu'une capture d'Apple Fitness rend, une fois lue et convertie (`IMP-03`). */
const DRAFT = {
  kind: 'run',
  date: '2026-07-28',
  workout_type: 'Course à pied',
  distance_km: 8.369,
  duration_min: 44.2,
  avg_hr: 152,
  pace_min_km: 5.28,
  cadence_spm: 168,
  elevation_m: null,
  calories: 620,
  total_calories: 690,
  start_time: '07:02:00',
  end_time: '07:46:12',
  split_length_km: 1,
  splits: [
    {
      index: 1,
      duration_s: 316,
      distance_km: 1,
      pace_min_km: 5.27,
      cadence_spm: 168,
      avg_hr: 148,
      elevation_m: 3,
      partial: false,
    },
  ],
  splits_trusted: true,
  splits_doubts: [],
  missing: ['elevation_m'],
  duplicate: null,
};

const IMPORTED = {
  kind: 'run',
  id: 0,
  date: '2026-07-28',
  label: 'Course',
  duration_min: 44.2,
  distance_km: 8.369,
  source: 'apple',
};

function stub(custom?: (url: string, init?: RequestInit) => Response | undefined) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      calls.push({ url, init });
      const override = custom?.(url, init);
      if (override) return Promise.resolve(override);
      if (url.includes('/api/ai/status')) {
        return Promise.resolve(json(200, { enabled: true, message: 'disponible' }));
      }
      if (url.includes('/api/import/apple/analyze')) return Promise.resolve(json(200, DRAFT));
      if (url.endsWith('/api/import/apple')) return Promise.resolve(json(201, IMPORTED));
      return Promise.resolve(json(200, {}));
    }),
  );
}

function renderSheet() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>
          <NewActivitySheet open today="2026-07-29" onClose={() => {}} onSwimImported={() => {}} />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function readScreenshot(): Promise<void> {
  await screen.findByText('choisir une capture d’écran');
  const input = document.querySelector('#apple-screenshot') as HTMLInputElement;
  await userEvent.upload(input, new File(['png'], 'capture.png', { type: 'image/png' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Lire la capture' }));
  await screen.findByText(/Les champs en pointillé/);
}

function writes(): Call[] {
  return calls.filter((call) => call.init?.method !== undefined && call.init.method !== 'GET');
}

function posted(): Record<string, unknown> {
  const call = writes().find((item) => item.url.endsWith('/api/import/apple'));
  return JSON.parse(call?.init?.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  calls.length = 0;
  reductions.length = 0;
  URL.createObjectURL = vi.fn(() => 'blob:capture');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('une capture lue dans la feuille « Course »', () => {
  it('réduit la capture à la qualité qui garde les chiffres lisibles', async () => {
    stub();
    renderSheet();
    await readScreenshot();

    expect(reductions).toEqual([0.92]);
  });

  it("n'écrit rien à la lecture", async () => {
    // `IMP-01` : l'analyse lit seulement. Entre lire et écrire, il y a un appui.
    stub();
    renderSheet();
    await readScreenshot();

    expect(writes().filter((call) => !call.url.includes('analyze'))).toHaveLength(0);
  });

  it('pré-remplit, marque ce qui est lu, et dit ce qui manquait', async () => {
    stub();
    renderSheet();
    await readScreenshot();

    expect(screen.getByLabelText('Distance (km)')).toHaveAttribute(
      'aria-description',
      'valeur proposée, à valider',
    );
    expect(screen.getByLabelText('Calories')).toHaveValue('620');
    // `IMP-03` : une valeur absente reste absente, n'est marquée par personne, et se dit.
    expect(screen.getByLabelText('Dénivelé (m)')).toHaveValue('');
    expect(screen.getByLabelText('Dénivelé (m)')).not.toHaveAttribute('aria-description');
    expect(screen.getByText('Le dénivelé')).toBeInTheDocument();
    // La durée lue se redit comme une montre l'écrit.
    expect(screen.getByText('lue : 44:12')).toBeInTheDocument();
  });

  it('écrit par l’import tout ce que la carte écrivait', async () => {
    // M-14 : dénivelé, calories, heures et paliers étaient lus puis jetés par la feuille,
    // qui écrivait en `source=manual`. L'import les porte, et marque `apple`.
    stub();
    renderSheet();
    await readScreenshot();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la course' }));

    await waitFor(() => {
      expect(posted()).toMatchObject({
        kind: 'run',
        date: '2026-07-28',
        distance_km: '8,369',
        duration_min: '44,2',
        cadence_spm: '168',
        avg_hr: '152',
        calories: '620',
        elevation_m: null,
        total_calories: 690,
        start_time: '07:02:00',
        end_time: '07:46:12',
        split_length_km: 1,
      });
    });
    expect((posted().splits as unknown[]).length).toBe(1);
    expect(calls.some((call) => call.url.endsWith('/api/activity/runs'))).toBe(false);
  });

  it('n’envoie pas l’allure lue à côté de la distance lue', async () => {
    // Audit du 17 octobre, fiche 02 : l'allure, arrondie à la seconde, gagnait chez le
    // serveur et recalculait la distance — 8,14 km devenaient 8,142.
    stub();
    renderSheet();
    await readScreenshot();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la course' }));

    await waitFor(() => {
      expect(posted().pace_min_km).toBeNull();
    });
  });

  it('jette la lecture quand on n’est pas d’accord', async () => {
    stub();
    renderSheet();
    await readScreenshot();

    await userEvent.click(screen.getByRole('button', { name: /Pas d’accord|Pas d'accord/ }));

    expect(screen.queryByLabelText('Distance (km)')).not.toBeInTheDocument();
    expect(screen.getByText('importer un fichier .fit')).toBeInTheDocument();
    expect(writes().filter((call) => !call.url.includes('analyze'))).toHaveLength(0);
  });

  it('laisse la date vide quand elle n’était pas sur la capture, et attend', async () => {
    // Elle retombait sur aujourd'hui : une date que personne n'avait lue ni choisie.
    stub((url) =>
      url.includes('/api/import/apple/analyze')
        ? json(200, { ...DRAFT, date: null, missing: ['date', 'elevation_m'] })
        : undefined,
    );
    renderSheet();
    await readScreenshot();

    expect(screen.getByLabelText('Date')).toHaveValue('');
    expect(screen.getByText('non lue sur la capture')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer la course' })).toBeDisabled();
  });

  it('avertit d’un doublon probable sans rien bloquer', async () => {
    stub((url) =>
      url.includes('/api/import/apple/analyze')
        ? json(200, {
            ...DRAFT,
            duplicate: {
              kind: 'run',
              id: 3,
              date: '2026-07-28',
              label: 'Course de 8,40 km',
              duration_min: 44.2,
            },
          })
        : undefined,
    );
    renderSheet();
    await readScreenshot();

    expect(screen.getByText('doublon probable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer la course' })).toBeEnabled();
  });

  it('dit ce que la relecture pense des paliers', async () => {
    stub((url) =>
      url.includes('/api/import/apple/analyze')
        ? json(200, {
            ...DRAFT,
            splits_trusted: false,
            splits_doubts: ['la somme des paliers dépasse la durée de 3 min'],
          })
        : undefined,
    );
    renderSheet();
    await readScreenshot();

    expect(screen.getByText('paliers douteux')).toBeInTheDocument();
    expect(screen.getByText(/dépasse la durée de 3 min/)).toBeInTheDocument();
  });

  it('enregistre une course lue comme une séance, et le dit', async () => {
    // La carte refusait la séance ; ici la nature est choisie : c'est une course.
    stub((url) =>
      url.includes('/api/import/apple/analyze')
        ? json(200, { ...DRAFT, kind: 'workout' })
        : undefined,
    );
    renderSheet();
    await readScreenshot();

    expect(screen.getByText(/lue comme une séance/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la course' }));
    await waitFor(() => {
      expect(posted().kind).toBe('run');
    });
  });

  it('garde la saisie à la main sur l’écriture d’une course, sans import', async () => {
    stub();
    renderSheet();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Saisir une course à la main' }),
    );

    expect(screen.queryByLabelText('Dénivelé (m)')).not.toBeInTheDocument();
    expect(screen.queryByText(/Les champs en pointillé/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-07-29');
  });
});
