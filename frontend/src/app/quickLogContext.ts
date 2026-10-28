/**
 * La saisie rapide « Noter », ouverte d'ailleurs que de la barre d'onglets (M-11).
 *
 * La feuille vivait dans l'état local de `TabBar` : seul le bouton central l'ouvrait, et
 * l'état vide de l'accueil envoyait sur `/corps` et `/routine` faire ce qu'elle fait sur
 * place. L'état monte dans la coquille (`QuickLogProvider`), et tout écran l'ouvre par ce
 * crochet — **une** feuille, **une** ouverture.
 *
 * À part du composant, comme `routes/morning/context.ts` : un module qui exporte un
 * composant et un crochet perd le rechargement à chaud de Vite.
 */

import { createContext, useContext } from 'react';

export interface QuickLogControl {
  /** Vrai tant que la feuille est ouverte — pour `aria-expanded` sur ce qui l'ouvre. */
  open: boolean;
  show: () => void;
}

export const QuickLogContext = createContext<QuickLogControl | null>(null);

/** Hors de la coquille (un test d'écran seul), la feuille n'existe pas : rien ne s'ouvre. */
export function useQuickLog(): QuickLogControl {
  return useContext(QuickLogContext) ?? { open: false, show: () => undefined };
}
