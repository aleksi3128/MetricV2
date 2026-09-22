/**
 * La porte manuelle du parcours du matin, à part du composant : un module qui exporte un
 * composant et un crochet perd le rechargement à chaud de Vite.
 */

import { createContext, useContext } from 'react';

export const MorningContext = createContext<(() => void) | null>(null);

/** Ouvre le parcours à la main, à toute heure — la porte qui ne dépend pas de la fenêtre. */
export function useOpenMorning(): () => void {
  const open = useContext(MorningContext);
  return open ?? (() => undefined);
}
