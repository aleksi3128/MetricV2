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
