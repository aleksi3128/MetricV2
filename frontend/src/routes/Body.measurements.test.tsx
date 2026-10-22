/**
 * Les mensurations de `/corps` (M-08, point 1) : l'historique, corriger, supprimer, et la
 * courbe.
 *
 * La section est montée seule : les pesées et les douleurs ont leurs propres fichiers, et
 * leurs requêtes n'apprendraient rien ici.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { createQueryClient } from '@/lib/query';

import { Measurements } from './body/Measurements';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

const calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

function indicator(field: string, label: string, latest: number | null) {
  return {
    field,
    label,
    latest,
    latest_date: latest === null ? null : '2026-07-20',
    delta: null,
    direction: null,
    unit: field === 'body_fat_pct' ? '%' : 'cm',
  };
}

function entry(id: number, date: string, fields: Record<string, number | null> = {}) {
  return {
    id,
    token: `jeton-${String(id)}`,
    date,
    waist_cm: null,
    chest_cm: null,
    arm_cm: null,
    hips_cm: null,
    thigh_cm: null,
    body_fat_pct: null,
    note: null,
    ...fields,
  };
}

const INDICATORS = [
  indicator('waist_cm', 'Taille', 82),
  indicator('chest_cm', 'Poitrine', null),
  indicator('arm_cm', 'Bras', 34.5),
  indicator('hips_cm', 'Hanches', null),
  indicator('thigh_cm', 'Cuisse', null),
  indicator('body_fat_pct', 'Masse grasse', null),
];

/** Trois relevés, du plus récent au plus ancien, comme le serveur les rend. */
const VIEW = {
  today: '2026-07-21',
  indicators: INDICATORS,
  entries: [
    entry(2, '2026-07-20', { waist_cm: 82, arm_cm: 34.5 }),
    { ...entry(1, '2026-06-20', { waist_cm: 83 }), note: 'après le dîner' },
    entry(0, '2026-05-20', { waist_cm: 28 }),
  ],
  total: 3,
};

function series(metric: string, label: string, values: number[]) {
  return {
    metric,
    label,
    unit: 'cm',
    granularity: 'day',
    subject: null,
    range: 'all',
    points: values.map((value, index) => ({
      date: `2026-0${String(5 + index)}-20`,
      value,
    })),
    stats: {
      latest: values.at(-1) ?? null,
      latest_date: null,
      change: null,
      average: null,
      minimum: values.length > 0 ? Math.min(...values) : null,
      maximum: values.length > 0 ? Math.max(...values) : null,
      count: values.length,
    },
  };
}

function stub(custom?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input as string;
    calls.push({ url, init });
    const answer = custom?.(url, init);
    if (answer !== undefined) return Promise.resolve(answer);
    if (init?.method === 'PATCH') return Promise.resolve(json(200, VIEW.entries[0]));
    if (init?.method === 'DELETE') return Promise.resolve(json(204, null));
    if (url.includes('/api/aggregates/series')) {
      return Promise.resolve(
        json(
          200,
          url.includes('arm_cm')
            ? series('arm_cm', 'Bras', [34.5])
            : series('waist_cm', 'Taille', [28, 83, 82]),
        ),
      );
    }
    if (url.includes('/body/measurements')) return Promise.resolve(json(200, VIEW));
    return Promise.resolve(json(200, {}));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSection() {
  const client = createQueryClient();
  // Une panne de stockage est « passagère » : sans ceci, le client la réessaierait avant
  // de la montrer, au-delà du délai d'attente des tests.
  client.setDefaultOptions({ queries: { retry: false } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Toaster>
          <Measurements />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** La liste de l'historique, une fois arrivée. */
async function history(): Promise<HTMLElement> {
  const title = await screen.findByRole('heading', { name: /Historique/ });
  const card = title.parentElement;
  if (card === null) throw new Error('carte introuvable');
  return within(card).findByRole('list');
}

beforeEach(() => {
  calls.length = 0;
  // `jsdom` ne sait pas faire défiler ; « corriger » y fait monter le formulaire.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('l’historique des mensurations', () => {
  it('liste chaque relevé avec les seules mesures qu’il porte', async () => {
    stub();
    renderSection();

    const list = await history();
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByText('Taille 82 cm · Bras 34,5 cm')).toBeVisible();
    // Une mesure absente n'est pas un zéro : elle n'est pas écrite du tout.
    expect(within(rows[0] as HTMLElement).queryByText(/Poitrine/)).toBeNull();
    expect(within(rows[1] as HTMLElement).getByText('après le dîner')).toBeVisible();
  });

  it('demande dix relevés, puis tous sur « Toutes (N) »', async () => {
    stub((url) =>
      url.includes('/body/measurements') && url.includes('limit=10')
        ? json(200, { ...VIEW, total: 14 })
        : undefined,
    );
    renderSection();

    await history();
    await userEvent.click(screen.getByRole('button', { name: 'Toutes (14)' }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('limit=500'))).toBe(true);
    });
  });

  it('n’offre pas « Toutes » quand tout est déjà là', async () => {
    stub();
    renderSection();

    await history();
    expect(screen.queryByRole('button', { name: /^Toutes/ })).toBeNull();
  });

  it('dit ce que coûte le premier relevé, sans courbe ni zéro', async () => {
    stub((url) =>
      url.includes('/body/measurements')
        ? json(200, {
            ...VIEW,
            indicators: INDICATORS.map((item) => ({ ...item, latest: null })),
            entries: [],
            total: 0,
          })
        : undefined,
    );
    renderSection();

    expect(await screen.findByText('Aucun relevé')).toBeVisible();
    expect(screen.getByText('Pas encore de courbe')).toBeVisible();
    // Aucune série demandée pour une mesure jamais prise.
    expect(calls.some((call) => call.url.includes('/api/aggregates/series'))).toBe(false);
  });

  it('nomme la panne au lieu d’affirmer un historique vide', async () => {
    stub((url) =>
      url.includes('/body/measurements')
        ? json(503, { code: 'storage_unavailable', message: 'Nextcloud ne répond pas.' })
        : undefined,
    );
    renderSection();

    expect(await screen.findByText('Historique indisponible')).toBeVisible();
    expect(screen.getByText('Mensurations indisponibles')).toBeVisible();
    expect(screen.queryByText('Aucun relevé')).toBeNull();
  });
});

describe('corriger un relevé', () => {
  it('rouvre le formulaire sur la ligne, et renvoie son jeton', async () => {
    stub();
    renderSection();

    const list = await history();
    await userEvent.click(
      within(list).getByRole('button', { name: 'Corriger le relevé du 20/05/2026' }),
    );

    expect(screen.getByRole('heading', { name: 'Corriger le relevé du 20/05/2026' })).toBeVisible();
    const waist = screen.getByLabelText('Taille (cm)');
    expect(waist).toHaveValue('28');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-05-20');

    await userEvent.clear(waist);
    await userEvent.type(waist, '82');
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le relevé' }));

    const patch = await waitFor(() => {
      const found = calls.find((call) => call.init?.method === 'PATCH');
      expect(found).toBeDefined();
      return found;
    });
    expect(patch?.url).toBe('/api/body/measurements/0');
    expect(new Headers(patch?.init?.headers).get('If-Match')).toBe('jeton-0');
    const body = JSON.parse(patch?.init?.body as string) as Record<string, unknown>;
    // La ligne est remplacée : les mesures vides partent à `null`, la note telle quelle.
    expect(body).toMatchObject({ date: '2026-05-20', waist_cm: 82, arm_cm: null, note: null });
  });

  it('garde la note, que le formulaire ne montre pas', async () => {
    stub();
    renderSection();

    const list = await history();
    await userEvent.click(
      within(list).getByRole('button', { name: 'Corriger le relevé du 20/06/2026' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le relevé' }));

    await waitFor(() => {
      const patch = calls.find((call) => call.init?.method === 'PATCH');
      expect(JSON.parse(patch?.init?.body as string)).toMatchObject({ note: 'après le dîner' });
    });
  });

  it('dit le conflit, sans le forcer', async () => {
    stub((_, init) =>
      init?.method === 'PATCH'
        ? json(409, { code: 'conflict', message: 'Recharge la donnée avant de la modifier.' })
        : undefined,
    );
    renderSection();

    const list = await history();
    await userEvent.click(
      within(list).getByRole('button', { name: 'Corriger le relevé du 20/07/2026' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le relevé' }));

    expect(await screen.findByText('Recharge la donnée avant de la modifier.')).toBeVisible();
    expect(calls.filter((call) => call.init?.method === 'PATCH')).toHaveLength(1);
  });

  it('revient à un relevé neuf sur « Annuler »', async () => {
    stub();
    renderSection();

    const list = await history();
    await userEvent.click(
      within(list).getByRole('button', { name: 'Corriger le relevé du 20/07/2026' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByRole('heading', { name: 'Nouveau relevé' })).toBeVisible();
    expect(screen.getByLabelText('Taille (cm)')).toHaveValue('');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-07-21');
  });
});

describe('supprimer un relevé', () => {
  it('demande deux appuis, et renvoie le jeton lu', async () => {
    stub();
    renderSection();

    const list = await history();
    await userEvent.click(
      within(list).getByRole('button', { name: 'Supprimer le relevé du 20/05/2026' }),
    );
    // Le premier appui arme : rien n'est parti.
    expect(calls.some((call) => call.init?.method === 'DELETE')).toBe(false);

    await userEvent.click(
      within(list).getByRole('button', { name: 'Supprimer le relevé du 20/05/2026 — confirmer' }),
    );

    const removal = await waitFor(() => {
      const found = calls.find((call) => call.init?.method === 'DELETE');
      expect(found).toBeDefined();
      return found;
    });
    expect(removal?.url).toBe('/api/body/measurements/0');
    expect(new Headers(removal?.init?.headers).get('If-Match')).toBe('jeton-0');
  });
});

describe('la courbe des mensurations', () => {
  it('propose les seules mesures relevées, et trace la première', async () => {
    stub();
    renderSection();

    const strip = await screen.findByRole('group', { name: 'Mesure de la courbe' });
    expect(
      within(strip)
        .getAllByRole('button')
        .map((chip) => chip.textContent),
    ).toEqual(['Taille', 'Bras']);
    await waitFor(() => {
      expect(
        calls.some((call) => call.url.includes('/api/aggregates/series?metric=waist_cm&range=all')),
      ).toBe(true);
    });
    expect(await screen.findByText(/3 relevés/)).toBeVisible();
  });

  it('dit qu’un seul relevé ne trace pas de courbe', async () => {
    stub();
    renderSection();

    const strip = await screen.findByRole('group', { name: 'Mesure de la courbe' });
    await userEvent.click(within(strip).getByRole('button', { name: 'Bras' }));

    expect(await screen.findByText('Bras : un seul relevé')).toBeVisible();
  });

  it('nomme une série en panne au lieu de la dire courte', async () => {
    stub((url) =>
      url.includes('/api/aggregates/series')
        ? json(503, { code: 'storage_unavailable', message: 'Nextcloud ne répond pas.' })
        : undefined,
    );
    renderSection();

    expect(await screen.findByText('Courbe indisponible')).toBeVisible();
  });
});
