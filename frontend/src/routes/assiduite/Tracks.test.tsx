import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { TrackImpact } from '@/features/heatmap/api';
import { createQueryClient } from '@/lib/query';
import { TRACKS } from '@/test/fixtures';

import { TracksSheet, type TracksTab } from './TracksSheet';

/** La feuille « Régler les pistes » ouverte, comme l'en-tête de `/assiduite` l'ouvre (M-04). */
function OpenSheet() {
  const [tab, setTab] = useState<TracksTab>('pistes');
  return <TracksSheet open onClose={() => undefined} tab={tab} onTab={setTab} />;
}

/** Passe à l'onglet des jours neutralisés. */
async function showOffDays() {
  await userEvent.click(await screen.findByRole('button', { name: 'Jours neutralisés' }));
}

/**
 * Réglage des pistes (`L11-10`, `L11-11`).
 *
 * **Le test qui compte est celui de la confirmation chiffrée.** `HEAT-20` et la décision
 * **D4** exigent que le recalcul rétroactif soit annoncé *avant* d'être appliqué ; le lot
 * L09 n'avait livré que l'avertissement, faute de moteur. Si la simulation cessait d'être
 * demandée, l'enregistrement continuerait de fonctionner et rien ne signalerait la
 * régression — sauf ce test.
 */

interface Call {
  url: string;
  method: string;
  body: unknown;
}

const calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const NO_CHANGE: TrackImpact = {
  retroactive: false,
  range: { from: '2025-07-28', to: '2026-08-02' },
  changed_days: 0,
  to_missed: 0,
  to_done: 0,
  restyled: 0,
  warnings: [],
};

const HEAVY: TrackImpact = {
  retroactive: true,
  range: { from: '2025-07-28', to: '2026-08-02' },
  changed_days: 34,
  to_missed: 34,
  to_done: 0,
  restyled: 0,
  warnings: ['34 journées passeraient de validée à manquée.'],
};

function stub(impact: TrackImpact = NO_CHANGE) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input as string;
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body === undefined ? null : JSON.parse(init.body as string),
    });

    if (url.includes('/preview')) return Promise.resolve(json(200, impact));
    if (init?.method === 'PATCH') {
      return Promise.resolve(
        json(200, {
          track: TRACKS.tracks[0],
          recalculated_history: true,
          warnings: ['Enregistré.'],
        }),
      );
    }
    return Promise.resolve(json(200, TRACKS));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderTracks() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>
          <OpenSheet />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Déplie l'éditeur d'une piste désignée par son nom. */
async function openEditor(name: string) {
  const heading = await screen.findByRole('heading', { name: new RegExp(name) });
  const card = heading.closest('div')?.parentElement;
  const edit = card?.querySelector<HTMLButtonElement>('button');
  if (!edit) throw new Error(`pas de bouton « Modifier » pour ${name}`);
  await userEvent.click(edit);
}

function patched() {
  return calls.filter((call) => call.method === 'PATCH');
}

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('réglage des pistes', () => {
  it('liste les pistes avec leur cadence formulée par le serveur', async () => {
    stub();
    renderTracks();

    expect(await screen.findByRole('heading', { name: /Eau/ })).toBeInTheDocument();
    // `HEAT-30` : le libellé vient du serveur, il n'est pas reconstruit ici.
    expect(screen.getByText(/tous les jours/)).toBeInTheDocument();
    expect(screen.getByText(/2 fois par semaine/)).toBeInTheDocument();
  });

  it('propose les sources du serveur, jamais une liste codée en dur', async () => {
    // `HEAT-02`. Une liste recopiée cesserait de décrire l'API au premier ajout.
    stub();
    renderTracks();
    await openEditor('Eau');

    const select = screen.getByRole('combobox', { name: /source/i });
    expect(select).toHaveValue('hydration.intake');
    expect(screen.getByRole('option', { name: 'Volume bu' })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: "Séries d'un groupe musculaire" }),
    ).toBeInTheDocument();
  });

  it('fait choisir un complément par son nom, pas par son identifiant', async () => {
    // Audit du 17 octobre, fiche 03 : le filtre attendait un `schedule_id` jamais affiché.
    stub();
    renderTracks();
    await openEditor('Eau');

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /source/i }),
      'supplement.intake',
    );
    const supplement = screen.getByRole('combobox', { name: 'Supplément' });
    await userEvent.selectOptions(supplement, 'Whey');
    expect(supplement).toHaveValue('8e11f8e26707');
  });

  it('chiffre le recalcul et attend une confirmation avant d’écrire', async () => {
    // **Le test central du lot.** « 34 journées passeraient de validée à manquée » doit
    // s'afficher, et rien ne doit être écrit tant que l'utilisateur n'a pas confirmé.
    stub(HEAVY);
    renderTracks();
    await openEditor('Torse');

    const threshold = screen.getByLabelText(/Seuil de validation/);
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText('34 journées passeraient de validée à manquée.'),
    ).toBeInTheDocument();
    expect(patched()).toHaveLength(0);
  });

  it('écrit seulement après « Appliquer quand même »', async () => {
    stub(HEAVY);
    renderTracks();
    await openEditor('Torse');

    const threshold = screen.getByLabelText(/Seuil de validation/);
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: 'Appliquer quand même' }));

    await waitFor(() => {
      expect(patched()).toHaveLength(1);
    });
    expect(patched()[0]?.body).toMatchObject({ validation_threshold: 3 });
  });

  it('renonce sans rien écrire', async () => {
    stub(HEAVY);
    renderTracks();
    await openEditor('Torse');

    const threshold = screen.getByLabelText(/Seuil de validation/);
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(patched()).toHaveLength(0);
  });

  it('montre le seuil de l’eau sans le laisser régler', async () => {
    // Audit du 17 octobre, fiche 05 : le seuil de la piste eau est l'objectif
    // d'hydratation. Le régler ici ferait revenir deux chiffres pour la même journée.
    stub();
    renderTracks();
    await openEditor('Eau');

    const threshold = screen.getByLabelText(/Seuil de validation/);
    expect(threshold).toBeDisabled();
    expect(threshold).toHaveValue('2000');
    expect(
      screen.getByText(
        /la cible d’hydratation — elle se règle sur la routine, carte Hydratation, « Régler »/,
      ),
    ).toBeInTheDocument();
  });

  it('ne dérange pas quand la modification ne rejuge rien', async () => {
    // Un panneau qui apparaîtrait à chaque enregistrement deviendrait invisible en une
    // semaine — et la fois où il compte, personne ne le lirait.
    stub(NO_CHANGE);
    renderTracks();
    await openEditor('Eau');

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(patched()).toHaveLength(1);
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renvoie le jeton de la ligne lue en « If-Match »', async () => {
    // `STO-05` : on modifie la ligne telle qu'on l'a lue, jamais « la ligne 3 ».
    stub(NO_CHANGE);
    renderTracks();
    await openEditor('Eau');

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(patched()).toHaveLength(1);
    });
    const call = calls.find((entry) => entry.method === 'PATCH');
    expect(call?.url).toContain('/api/heatmap/tracks/eau');
  });

  it('neutralise une plage de jours', async () => {
    // `HEAT-06`. Une grippe ne casse pas une série de quatre-vingt-dix jours.
    stub();
    renderTracks();
    await screen.findByRole('heading', { name: /Eau/ });
    await showOffDays();

    await userEvent.type(screen.getByLabelText('Du'), '2026-07-01');
    await userEvent.type(screen.getByLabelText('Au'), '2026-07-05');
    await userEvent.click(screen.getByRole('button', { name: 'Neutraliser' }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/api/heatmap/off-days'))).toBe(true);
    });
  });

  it('liste les plages déjà neutralisées et permet de les rétablir', async () => {
    stub();
    renderTracks();
    await showOffDays();

    // La raison est notée dans le fichier pour qu'on s'en souvienne dans six mois.
    expect((await screen.findAllByText(/grippe/)).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Rétablir' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
    });
  });

  it('affiche le refus du serveur tel qu’il est écrit', async () => {
    // `API-07` : le message est en français et s'affiche sans réécriture.
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      calls.push({ url, method: init?.method ?? 'GET', body: null });
      if (url.includes('/preview')) {
        return Promise.resolve(
          json(422, { code: 'validation_error', message: 'Ce seuil est invraisemblable.' }),
        );
      }
      return Promise.resolve(json(200, TRACKS));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTracks();
    await openEditor('Eau');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    // Deux fois à l'écran, et c'est voulu : dans le bandeau du formulaire, et dans le
    // toast — l'un reste sous les yeux, l'autre signale que quelque chose vient d'arriver.
    expect((await screen.findAllByText('Ce seuil est invraisemblable.')).length).toBe(2);
    expect(patched()).toHaveLength(0);
  });

  it('supprime une piste en deux appuis, jamais en un (M-04)', async () => {
    // La suppression partait au premier appui ; le projet n'a aucune annulation.
    stub();
    renderTracks();
    await openEditor('Eau');

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer la piste Eau' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);

    await userEvent.click(
      screen.getByRole('button', { name: 'Supprimer la piste Eau — confirmer' }),
    );
    await waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
    });
  });
});
