/**
 * La feuille « Plus » (M-12) : quatre groupes qui suivent la journée, dans cet ordre.
 *
 * Le test fige l'ordre des groupes **et** celui des entrées : c'est tout ce que la fiche
 * change, et une entrée glissée d'un groupe à l'autre ne casserait aucun autre test.
 */

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '@/lib/auth';

import { MoreSheet } from './MoreSheet';

const AUTH: AuthContextValue = {
  state: { status: 'authenticated', username: 'aleksi' },
  login: vi.fn(),
  adopt: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
  retry: vi.fn(),
};

function renderSheet() {
  return render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter>
        <MoreSheet open onClose={vi.fn()} />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('la feuille « Plus »', () => {
  it('range les destinations par moment de la journée, dans l’ordre', () => {
    renderSheet();

    const dialog = screen.getByRole('dialog');
    // `SheetGroup` est une `<section>` sans nom accessible : son titre est son premier
    // paragraphe. Les lire tels qu'ils sont dessinés suffit à figer l'ordre.
    const groups = [...dialog.querySelectorAll('section')].map((group) => ({
      title: group.querySelector('p')?.textContent.trim() ?? '',
      entries: within(group)
        .getAllByRole('button')
        .map((button) => button.textContent.trim()),
    }));

    expect(groups.map((group) => group.title)).toEqual([
      'Chaque jour',
      'Prévoir',
      'Relire',
      'Référence',
    ]);
    expect(groups.map((group) => group.entries)).toEqual([
      ['Nutrition', 'Hydratation & suppléments', 'Poids & mensurations'],
      ['Planning', 'Plan de course', 'Objectif'],
      ['Charge & forme', 'Assiduité'],
      ['Dossier médical', 'Réglages', 'Déconnexion'],
    ]);
  });
});
