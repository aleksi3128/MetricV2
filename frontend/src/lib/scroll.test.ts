/**
 * Remonter en haut à chaque changement de page.
 *
 * Le comportement se vérifie sur le crochet plutôt que sur la coquille : celle-ci demande
 * une session, un routeur et un client de requêtes pour rendre une ligne, et le crochet
 * porte les trois décisions qui comptent.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useScrollTop } from './scroll';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** jsdom n'implémente pas `scrollTo` : c'est le test qui le fournit. */
function spy() {
  const scrollTo = vi.fn();
  vi.stubGlobal('scrollTo', scrollTo);
  return scrollTo;
}

describe('useScrollTop', () => {
  it('remonte à chaque changement d’adresse', () => {
    const scrollTo = spy();
    const { rerender } = renderHook(
      ({ path }: { path: string }) => {
        useScrollTop(path);
      },
      {
        initialProps: { path: '/activite' },
      },
    );

    expect(scrollTo).toHaveBeenCalledTimes(1);

    rerender({ path: '/nutrition' });

    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('ne remonte pas deux fois sur la même adresse', () => {
    const scrollTo = spy();
    const { rerender } = renderHook(
      ({ path }: { path: string }) => {
        useScrollTop(path);
      },
      {
        initialProps: { path: '/nutrition' },
      },
    );

    rerender({ path: '/nutrition' });

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('remonte sans animation', () => {
    // `base.css` pose `scroll-behavior: smooth` : sans ce mot, changer d’onglet fait
    // remonter la page sous les yeux, et l’écran d’arrivée apparaît pendant le trajet.
    const scrollTo = spy();
    renderHook(() => {
      useScrollTop('/corps');
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('laisse une ancre décider de sa position', () => {
    // `/quelque-chose#section` demande explicitement autre chose que le haut.
    const scrollTo = spy();
    renderHook(() => {
      useScrollTop('/reglages', '#notifications');
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
