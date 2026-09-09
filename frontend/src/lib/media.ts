/**
 * Les deux points de rupture du projet, lisibles depuis un composant.
 *
 * ## Pourquoi une exception à la règle « tout en CSS »
 *
 * Le dépôt fait toute son adaptation en feuilles de style, et c'est le bon défaut : une
 * largeur qui décide en JavaScript se désynchronise du CSS au premier réglage oublié.
 * Deux cas y échappent, et un seul est traité ici — **ce qu'un composant dessine ou ne
 * dessine pas**. Une couche de `Chart` est un chemin SVG sans classe qu'une feuille de
 * style puisse atteindre : elle est tracée ou elle ne l'est pas, et `display: none` sur
 * un `<path>` la laisserait quand même peser dans le domaine de l'axe.
 *
 * Masquer en CSS ce qui reste dans le document a un second coût, plus discret : les
 * cibles cachées comptent quand même dans les audits, et un lecteur d'écran les lit.
 *
 * ## Le repli est le téléphone
 *
 * Sans `matchMedia` — le rendu serveur, jsdom en test — la réponse est `false`, donc la
 * version la plus dépouillée. C'est le plancher du projet (390 px), pas sa cible : un
 * repli qui donnerait la version large ferait apparaître en test des couches qu'un
 * téléphone ne verra jamais.
 */

import { useCallback, useSyncExternalStore } from 'react';

/** Deux ruptures, les mêmes que `base.css`. Une troisième ici en créerait une en CSS. */
export const WIDE = '(min-width: 600px)';
export const LARGE = '(min-width: 960px)';

function evaluate(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

/**
 * Vrai tant que la fenêtre satisfait la requête média, et suit ses changements.
 *
 * `useSyncExternalStore` plutôt qu'un `useState` posé dans un effet : la largeur de la
 * fenêtre est un état **extérieur** à React, et le lire dans un effet le laisse faux le
 * temps d'un rendu — assez pour qu'une rotation d'iPad montre la mauvaise version avant
 * de se corriger.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => {
        list.removeEventListener('change', notify);
      };
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => evaluate(query),
    // Hors navigateur, la version la plus dépouillée : le plancher, pas la cible.
    () => false,
  );
}
