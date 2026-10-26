import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { ThemeProvider } from '@/app/ThemeProvider';
import { createQueryClient } from '@/lib/query';
import { NOTIFICATIONS, SETTINGS, TRACKS } from '@/test/fixtures';

import { Settings } from './Settings';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

const calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

function stub(custom?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input as string;
    calls.push({ url, init });

    const override = custom?.(url, init);
    if (override) return Promise.resolve(override);

    // L'écran porte **quatre** sections servies par le réseau : les objectifs, les pistes
    // d'assiduité (L11), le profil et les rappels (L15). Un stub qui répondrait les
    // réglages à tout ferait planter les trois autres sur un champ absent — et le test
    // dirait « écran cassé » sans que l'écran le soit.
    if (url.includes('/api/heatmap/tracks')) return Promise.resolve(json(200, TRACKS));
    if (url.includes('/api/notifications')) return Promise.resolve(json(200, NOTIFICATIONS));
    // Sécurité et données (`docs/exploitation-securite.md`) : passkey fermée, rien d'utilisé.
    if (url.includes('/api/passkey'))
      return Promise.resolve(json(200, { configured: false, items: [] }));
    if (url.includes('/api/account'))
      return Promise.resolve(
        json(200, {
          today: '2026-10-20',
          usage: { share: null, text: 'Aucun appel au modèle ce mois-ci.' },
          backup: { last: null, daily: false, text: 'Aucune sauvegarde encore.' },
        }),
      );
    return Promise.resolve(json(200, SETTINGS));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSettings() {
  return render(
    // L'écran porte la section « Apparence » depuis le thème clair : sans le provider,
    // `useTheme` lève, et le test dirait « écran cassé » sans que l'écran le soit.
    <ThemeProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <Toaster>
            <Settings />
          </Toaster>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

function saved() {
  return calls.find((call) => call.init?.method === 'PATCH');
}

function body(call: Call | undefined): Record<string, unknown> {
  return JSON.parse(call?.init?.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('écran Réglages', () => {
  it('ne porte plus le profil de l’assistant, parti à côté du carnet (M-05)', async () => {
    stub();
    renderSettings();

    await screen.findByDisplayValue('68');
    expect(screen.queryByText('Ce que je suis')).toBeNull();
    expect(screen.queryByLabelText('Taille (cm)')).toBeNull();
    expect(calls.some((call) => call.url.includes('/api/assistant/profile'))).toBe(false);
  });

  it('ne porte plus l’adresse de Cadence, partie sur la page des séances (M-04)', async () => {
    stub();
    renderSettings();

    await screen.findByDisplayValue('68');
    expect(screen.queryByText('Cadence Tabata')).toBeNull();
    expect(screen.queryByLabelText('Adresse de l’application')).toBeNull();
  });

  it('ne porte plus le glossaire de nage, parti sur sa sous-page du planning (M-04)', async () => {
    stub();
    renderSettings();

    await screen.findByDisplayValue('68');
    expect(screen.queryByText('Le glossaire de la notation')).toBeNull();
    expect(calls.some((call) => call.url.includes('/api/planning/swim/codes'))).toBe(false);
  });

  it('affiche les valeurs en vigueur', async () => {
    stub();
    renderSettings();

    expect(await screen.findByDisplayValue('68')).toBeInTheDocument();
    expect(screen.getByDisplayValue('150')).toBeInTheDocument();
  });

  it('distingue un réglage choisi d’une valeur de repli', async () => {
    // Un défaut ne doit pas passer pour un choix : l'écran le dit, et il affiche le
    // défaut que le **serveur** lui a envoyé plutôt qu'une constante recopiée ici.
    stub();
    renderSettings();

    expect(await screen.findByText('réglé')).toBeInTheDocument();
    // Poids, protéines, sucres, calories et la piste mise en avant ; l'eau et ses
    // raccourcis sont partis sur `/routine` (M-04). Seul le poids cible est réglé dans le
    // fixture.
    expect(screen.getAllByText('valeur par défaut')).toHaveLength(4);
    expect(screen.getByText(/défaut 70 kg/)).toBeInTheDocument();
  });

  it('n’envoie que ce qui a changé', async () => {
    // Envoyer les six clés à chaque enregistrement écrirait des valeurs de repli dans le
    // fichier : un objectif jamais choisi deviendrait un objectif choisi.
    stub();
    renderSettings();

    const protein = await screen.findByDisplayValue('150');
    await userEvent.clear(protein);
    await userEvent.type(protein, '180');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(body(saved())).toEqual({ target_protein_g: 180 });
    });
  });

  it('dit combien de réglages attendent d’être enregistrés', async () => {
    // Audit du 17 octobre, fiche 24 : un seul « Enregistrer », trois écrans plus bas.
    stub();
    renderSettings();

    expect(screen.queryByText(/réglage modifié/)).toBeNull();
    const protein = await screen.findByDisplayValue('150');
    await userEvent.clear(protein);
    await userEvent.type(protein, '180');

    expect(screen.getByText('1 réglage modifié')).toBeInTheDocument();
  });

  it('renvoie le jeton lu en « If-Match »', async () => {
    // `STO-05` : un jeu de réglages s'édite en bloc, la garde porte sur le fichier.
    stub();
    renderSettings();

    const target = await screen.findByDisplayValue('68');
    await userEvent.clear(target);
    await userEvent.type(target, '67');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      const headers = saved()?.init?.headers as Record<string, string>;
      expect(headers['If-Match']).toBe('jeton-reglages');
    });
  });

  it('convertit une virgule décimale avant d’envoyer', async () => {
    stub();
    renderSettings();

    const target = await screen.findByDisplayValue('68');
    await userEvent.clear(target);
    await userEvent.type(target, '67,5');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(body(saved())).toEqual({ target_weight_kg: 67.5 });
    });
  });

  it('ne porte plus l’eau ni ses raccourcis, partis sur la carte Hydratation (M-04)', async () => {
    stub();
    renderSettings();

    await screen.findByDisplayValue('68');
    expect(screen.queryByText('Hydratation par jour')).toBeNull();
    expect(screen.queryByDisplayValue('250, 500, 750')).toBeNull();
  });

  it('ne porte plus les repères de course, partis sur la page des courses (M-04)', async () => {
    stub();
    renderSettings();

    await screen.findByDisplayValue('68');
    expect(screen.queryByLabelText('FC max (bpm)')).toBeNull();
    expect(screen.queryByLabelText('Allure seuil (min/km)')).toBeNull();
  });

  it('n’active « Enregistrer » que si quelque chose a changé', async () => {
    stub();
    renderSettings();

    expect(await screen.findByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    const target = screen.getByDisplayValue('68');
    await userEvent.clear(target);
    await userEvent.type(target, '67');

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('rend le champ à sa valeur quand on annule', async () => {
    stub();
    renderSettings();

    const target = await screen.findByDisplayValue('68');
    await userEvent.clear(target);
    await userEvent.type(target, '67');
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByDisplayValue('68')).toBeInTheDocument();
    expect(saved()).toBeUndefined();
  });

  it('affiche le refus du serveur à côté du champ visé', async () => {
    // `API-06` : le client n'a aucune borne en dur, il transmet et montre le refus.
    stub((_url, init) =>
      init?.method === 'PATCH'
        ? json(422, {
            code: 'validation_error',
            message: 'Les données envoyées sont invalides.',
            fields: [
              { field: 'body.target_weight_kg', message: 'la valeur doit être inférieure à 500' },
            ],
          })
        : undefined,
    );
    renderSettings();

    const target = await screen.findByDisplayValue('68');
    await userEvent.clear(target);
    await userEvent.type(target, '900');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('la valeur doit être inférieure à 500')).toBeInTheDocument();
  });

  it('recharge après un conflit plutôt que de garder une saisie refusée', async () => {
    // La garde a parlé : l'écran doit repartir de ce que le fichier vaut vraiment.
    stub((_url, init) =>
      init?.method === 'PATCH'
        ? json(409, {
            code: 'conflict',
            message: 'Cette donnée a été modifiée ailleurs depuis son affichage.',
          })
        : undefined,
    );
    renderSettings();

    const target = await screen.findByDisplayValue('68');
    await userEvent.clear(target);
    await userEvent.type(target, '67');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    // Le bandeau du formulaire, et rien d'autre : le toast dit la même chose ailleurs.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cette donnée a été modifiée ailleurs depuis son affichage.',
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue('68')).toBeInTheDocument();
    });
  });
});

// ── Les rappels réactifs (**N2**) ─────────────────────

describe('rappels', () => {
  it('laisse saisir plusieurs heures pour l’hydratation', async () => {
    // Son écart se lit à plusieurs moments de la journée : un contrôle unique obligerait
    // à choisir entre « trop tôt pour savoir » et « trop tard pour agir ».
    stub();
    renderSettings();

    const champ = await screen.findByLabelText('Heures du rappel');
    expect(champ).toHaveAttribute('type', 'text');

    await userEvent.type(champ, '14:00, 18:00, 22:30');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les rappels' }));

    await waitFor(() => {
      const call = calls.find(
        (item) => item.init?.method === 'PATCH' && item.url.includes('/notifications/reminders'),
      );
      expect(JSON.parse(call?.init?.body as string)).toEqual({ hydration: '14:00, 18:00, 22:30' });
    });
  });

  it('dit les deux conditions d’un rappel d’hydratation', async () => {
    // Un contrôle qui ne part pas se lit comme un réglage cassé si l'on ignore que
    // l'écart décide aussi.
    stub();
    renderSettings();

    expect(await screen.findByText(/ne part que si l’écart est important/)).toBeInTheDocument();
  });

  it('propose un rappel de protéines', async () => {
    stub();
    renderSettings();

    expect(await screen.findByText('Protéines')).toBeInTheDocument();
    expect(screen.getByText(/s’il reste un écart qu’un repas peut combler/)).toBeInTheDocument();
  });
});
