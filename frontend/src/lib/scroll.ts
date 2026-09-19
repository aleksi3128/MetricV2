/**
 * Remonter en haut à chaque changement de page.
 *
 * Sans cela, ouvrir `/nutrition` depuis le bas de `/activite` déposait au **milieu** de
 * l'écran suivant : le navigateur conserve la position de défilement du document, et la
 * coquille ne remonte pas de son propre chef. Le défaut se voit surtout au pouce, où les
 * cinq cibles de `TabBar` sont en bas de l'écran — donc précisément là où l'on se trouve
 * après avoir fait défiler une page entière.
 *
 * ## Trois choix, chacun payé
 *
 * **`useLayoutEffect` et non `useEffect`** : l'effet de mise en page court avant la
 * peinture. Avec un effet ordinaire, la page suivante se peint une fois à l'ancienne
 * position, puis saute — un clignotement d'une trame, mais bien visible.
 *
 * **`instant` et non le défilement par défaut** : `base.css` pose `scroll-behavior:
 * smooth`, dont on veut bien pour une ancre dans la page, pas pour une navigation. Sans
 * ce mot, changer d'onglet fait remonter la page **sous les yeux**, et l'écran d'arrivée
 * apparaît pendant le trajet.
 *
 * **Une ancre est respectée** : `/quelque-chose#section` demande explicitement une autre
 * position que le haut. La lui refuser casserait le seul cas où le navigateur a raison.
 */

import { useLayoutEffect } from 'react';

export function useScrollTop(key: string, hash = ''): void {
  useLayoutEffect(() => {
    if (hash !== '') return;
    if (typeof window === 'undefined') return;
    // jsdom n'implémente pas `scrollTo` : sans cette garde, tout test qui rend la
    // coquille tombe sur un `TypeError` avant sa première assertion.
    if (typeof window.scrollTo !== 'function') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [key, hash]);
}
