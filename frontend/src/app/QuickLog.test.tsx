/**
 * « Noter » — les deux gestes qui demandent un formulaire mènent **au formulaire**.
 *
 * « Noter une séance » ouvrait déjà les séances (fiche 25 de l'audit) ; « Ajouter un repas »
 * menait au haut de `/nutrition`, où il fallait encore trouver le bouton (M-23).
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { tokenStore } from '@/lib/api';
import { createQueryClient } from '@/lib/query';

import { QuickLog } from './QuickLog';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderQuickLog() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/']}>
        <Toaster>
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
          <QuickLog open onClose={() => {}} />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  tokenStore.write('jeton-de-session');
  // Les sections chiffrées de la feuille n'importent pas ici : une panne les tait, et les
  // deux liens restent.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(json(503, { code: 'storage_unavailable', message: 'panne' }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  tokenStore.clear();
});

describe('Noter', () => {
  it('ouvre la feuille d’ajout d’un repas, et non le haut de la page', async () => {
    renderQuickLog();

    await userEvent.click(await screen.findByRole('button', { name: /Ajouter un repas/ }));

    expect(screen.getByTestId('where')).toHaveTextContent('/nutrition?ajout=repas');
  });

  it('ouvre les séances pour en noter une', async () => {
    renderQuickLog();

    await userEvent.click(await screen.findByRole('button', { name: /Noter une séance/ }));

    expect(screen.getByTestId('where')).toHaveTextContent('/activite/seances');
  });
});

/**
 * Un aliment scanné, en trois gestes (`NUT-28`) : « Scanner », le code, la quantité.
 *
 * Aucune caméra en jsdom — `navigator.mediaDevices` n'existe pas —, donc le scan s'ouvre
 * sur sa seconde porte, le champ des chiffres. C'est le cas d'une caméra refusée, et c'est
 * ce qui rend le parcours vérifiable.
 */
describe('scanner un aliment depuis « Noter »', () => {
  const SKYR = {
    barcode: '5000159407236',
    name: 'Skyr nature',
    brand: null,
    calories_100g: 63,
    protein_100g: 11,
    added_sugar_100g: 4,
    saturated_fat_100g: 0.1,
    fiber_100g: null,
    partial: false,
    portion_g: 150,
    source: 'catalog',
  };

  const NUTELLA = {
    ...SKYR,
    barcode: '3017620422003',
    name: 'Nutella',
    brand: 'Ferrero',
    calories_100g: 539,
    portion_g: null,
    source: 'openfoodfacts',
  };

  const DAY = {
    suggested_type: 'collation',
    types: ['petit-déjeuner', 'déjeuner', 'dîner', 'collation'],
  };

  interface Call {
    url: string;
    init: RequestInit | undefined;
  }

  let calls: Call[] = [];

  /** Le serveur : la journée, un produit par code, et la réponse d'enregistrement. */
  function serve(saved: () => Response) {
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input as string;
        calls.push({ url, init });
        if (url.endsWith(`/products/${SKYR.barcode}`)) return Promise.resolve(json(200, SKYR));
        if (url.endsWith(`/products/${NUTELLA.barcode}`)) {
          return Promise.resolve(json(200, NUTELLA));
        }
        if (url.includes('/api/nutrition/products/')) {
          return Promise.resolve(
            json(404, {
              code: 'product_not_found',
              message:
                'Ni ton catalogue ni Open Food Facts ne connaissent ce produit. Tu peux l’ajouter à la main.',
            }),
          );
        }
        if (url === '/api/nutrition/composed') return Promise.resolve(saved());
        if (url === '/api/nutrition') return Promise.resolve(json(200, DAY));
        return Promise.resolve(json(503, { code: 'storage_unavailable', message: 'panne' }));
      }),
    );
  }

  function meal(calories: number | null) {
    return json(201, {
      id: 3,
      token: 't',
      datetime: '2026-11-02T13:00:00+01:00',
      meal_type: 'collation',
      comment: 'Skyr nature',
      photo: null,
      protein_g: 16.5,
      added_sugar_g: 6,
      calories,
      saturated_fat_g: 0.2,
      fiber_g: null,
      source: 'manual',
      time_recorded: true,
      day_label: null,
    });
  }

  function renderOpen(onClose: () => void = () => undefined) {
    return render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={['/']}>
          <Toaster>
            <Routes>
              <Route path="*" element={<Where />} />
            </Routes>
            <QuickLog open onClose={onClose} />
          </Toaster>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  async function scan(code: string): Promise<void> {
    await userEvent.click(await screen.findByRole('button', { name: 'Scanner un aliment' }));
    await userEvent.type(await screen.findByLabelText('Code-barres'), code);
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));
  }

  function body(): Record<string, unknown> {
    const call = calls.find((item) => item.url === '/api/nutrition/composed');
    return JSON.parse(call?.init?.body as string) as Record<string, unknown>;
  }

  it('porte l’action en tête de la feuille, et ne charge la journée qu’au scan', async () => {
    serve(() => meal(95));
    renderOpen();

    const action = await screen.findByRole('button', { name: 'Scanner un aliment' });
    // Le pictogramme et son mot : un dessin seul ne dirait pas ce qu'il fait.
    expect(action).toHaveTextContent('Scanner');
    expect(calls.some((call) => call.url === '/api/nutrition')).toBe(false);

    await userEvent.click(action);

    expect(await screen.findByLabelText('Code-barres')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Scanner un aliment' })).toBeInTheDocument();
    expect(calls.some((call) => call.url === '/api/nutrition')).toBe(true);
  });

  it('pèse la portion d’un appui, enregistre par la route qui recalcule, et se ferme', async () => {
    serve(() => meal(95));
    const onClose = vi.fn();
    renderOpen(onClose);

    await scan(SKYR.barcode);

    const quantity = await screen.findByLabelText('Quantité');
    // Rien d'inscrit sans qu'on l'ait pesé : la portion est une puce, pas une valeur.
    expect(quantity).toHaveValue('');
    expect(screen.getByRole('dialog', { name: 'Skyr nature' })).toBeInTheDocument();
    expect(screen.getByText(/valeurs de ton catalogue · 63 kcal\/100 g/)).toBeInTheDocument();
    // Le type de l'heure vient du serveur, et il est affiché.
    expect(await screen.findByRole('button', { name: 'collation' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: '1 portion · 150 g' }));
    expect(quantity).toHaveValue('150');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    expect(
      await screen.findByText(/« Skyr nature », 150 g, noté en collation — 95 kcal\./),
    ).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    expect(body()).toEqual({
      meal_type: 'collation',
      comment: 'Skyr nature',
      lines: [
        {
          name: 'Skyr nature',
          quantity_g: 150,
          calories_100g: 63,
          protein_100g: 11,
          added_sugar_100g: 4,
          saturated_fat_100g: 0.1,
          fiber_100g: null,
          barcode: SKYR.barcode,
        },
      ],
    });
    // Aucun jour envoyé : aujourd'hui, daté par le serveur.
    expect(body()).not.toHaveProperty('day');
  });

  it('sans portion enregistrée, n’offre aucune puce ; un appui change le type', async () => {
    serve(() => meal(162));
    renderOpen();

    await scan(NUTELLA.barcode);

    await screen.findByLabelText('Quantité');
    expect(screen.queryByRole('button', { name: /portion/ })).toBeNull();
    expect(
      screen.getByText(/Ferrero · valeurs Open Food Facts · 539 kcal\/100 g/),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'dîner' }));
    expect(screen.getByRole('button', { name: 'dîner' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.type(screen.getByLabelText('Quantité'), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    await screen.findByText(/noté en/);
    expect(body().meal_type).toBe('dîner');
    expect(body().comment).toBe('Nutella');
  });

  it('dit le refus d’une quantité sous son champ, sans fermer la feuille', async () => {
    serve(() =>
      json(422, {
        code: 'validation_error',
        message: 'Les données envoyées sont invalides.',
        fields: [{ field: 'body.lines.0.quantity_g', message: 'Doit être supérieur à 0.' }],
      }),
    );
    const onClose = vi.fn();
    renderOpen(onClose);

    await scan(SKYR.barcode);
    await userEvent.type(await screen.findByLabelText('Quantité'), '0');
    await screen.findByRole('button', { name: 'collation' });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    expect(await screen.findByText('Doit être supérieur à 0.')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantité')).toHaveValue('0');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('refuse un texte qui n’est pas un poids, sans rien envoyer', async () => {
    serve(() => meal(95));
    renderOpen();

    await scan(SKYR.barcode);
    await userEvent.type(await screen.findByLabelText('Quantité'), 'un pot');
    await screen.findByRole('button', { name: 'collation' });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    expect(screen.getByText('Un poids en grammes, par exemple 125.')).toBeInTheDocument();
    expect(calls.some((call) => call.url === '/api/nutrition/composed')).toBe(false);
  });

  it('dit une panne sous le formulaire, et garde la saisie', async () => {
    serve(() => json(503, { code: 'storage_unavailable', message: 'Stockage injoignable.' }));
    const onClose = vi.fn();
    renderOpen(onClose);

    await scan(SKYR.barcode);
    await userEvent.type(await screen.findByLabelText('Quantité'), '120');
    await screen.findByRole('button', { name: 'collation' });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Stockage injoignable.');
    expect(screen.getByLabelText('Quantité')).toHaveValue('120');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('mène un code inconnu à la feuille complète, code gardé', async () => {
    serve(() => meal(95));
    renderOpen();

    await scan('0000000000000');
    expect(await screen.findByText(/Ni ton catalogue ni Open Food Facts/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter cet aliment à la main' }));

    expect(screen.getByTestId('where')).toHaveTextContent(
      '/nutrition?ajout=repas&code=0000000000000',
    );
  });

  it('revient aux écritures par « Retour »', async () => {
    serve(() => meal(95));
    renderOpen();

    await scan(SKYR.barcode);
    await screen.findByLabelText('Quantité');
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));

    expect(await screen.findByRole('dialog', { name: 'Noter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scanner un aliment' })).toBeInTheDocument();
  });
});
