import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { useScrollTop } from '@/lib/scroll';
import { EveningFlowProvider } from '@/routes/evening/EveningFlow';
import { MorningFlowProvider } from '@/routes/morning/MorningFlow';

import styles from './Shell.module.css';
import { MoreSheet } from './MoreSheet';
import { TabBar } from './TabBar';

/**
 * Coquille applicative (`L03-09`).
 *
 * **Deux navigations, un seul jeu d'écrans.** Sous 960 px, c'est [`TabBar`](./TabBar.tsx)
 * qui gouverne : cinq cibles en bas de l'écran, là où le pouce est déjà. Au-delà, la barre
 * horizontale ci-dessous reprend la main — une souris n'a pas de zone difficile à
 * atteindre, et un écran large a la place d'afficher neuf entrées d'un coup.
 *
 * **Six destinations et « Plus ».** La barre du haut alignait jusqu'à onze entrées :
 * 931 px pour 669 disponibles, mesurés à 1 440 px — « Planning » coupé, « Plan »,
 * « Assiduité » et « Réglages » hors champ derrière le dégradé de bord (audit du
 * 17 octobre, fiche 27). Les lots précédents grattaient des pixels mot par mot ; chaque
 * écran ajouté les reperdait. Ce qui se consulte à froid — le corps, le dossier, le plan
 * de course, l'assiduité, les réglages — passe dans la feuille « Plus », **la même** que
 * sur mobile.
 *
 * **Ce qu'on ouvre tous les jours, et rien d'autre** : l'activité, l'assistant, ce qu'on
 * mange, la routine. Le planning, qui se pose une fois par semaine, est dans « Plus » :
 * avec lui la barre demandait 601 px pour 549 à 960 px, et les deux seuls points de
 * rupture du projet ne laissent pas de palier pour le rattraper. L'assistant y gagne enfin
 * une entrée sur ordinateur : il n'en avait pas, faute de place.
 *
 * L'ordre du bas, lui, ne bouge pas : `TabBar` gouverne sous 960 px et n'a que cinq
 * cibles, choisies sur un autre critère — ce qu'on atteint au pouce entre deux exercices.
 * Aligner les deux reviendrait à faire décider une souris pour un pouce.
 */
const NAV = [
  { to: '/', label: 'Accueil', end: true },
  { to: '/activite', label: 'Activité', end: false },
  { to: '/assistant', label: 'Assistant', end: false },
  { to: '/nutrition', label: 'Nutrition', end: false },
  { to: '/routine', label: 'Routine', end: false },
] as const;

export function Shell() {
  const { state, logout } = useAuth();
  const { pathname, hash } = useLocation();
  const [more, setMore] = useState(false);

  // Chaque écran s'ouvre par son haut, et non à la hauteur où l'on avait laissé le
  // précédent — voir [`useScrollTop`](../lib/scroll.ts) pour ce que ça a coûté de ne pas
  // le faire.
  useScrollTop(pathname, hash);

  return (
    // Le parcours du matin s'ouvre au-dessus de n'importe quel écran : c'est l'ouverture de
    // l'application qu'il guette, pas celle d'une page (`docs/coach-course.md` §5).
    <MorningFlowProvider>
      {/* Le point du soir, même principe à l'autre bout de la journée
          (`docs/notifications-v3.md`). */}
      <EveningFlowProvider>
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.headerInner}>
              <NavLink to="/" className={cx(styles.brand)}>
                Metric
              </NavLink>

              <nav className={styles.nav} aria-label="Navigation principale">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => cx(styles.navLink, isActive && styles.navActive)}
                  >
                    {item.label}
                  </NavLink>
                ))}
                <button
                  type="button"
                  className={cx(styles.navLink, styles.navMore, more && styles.navActive)}
                  aria-haspopup="dialog"
                  aria-expanded={more}
                  onClick={() => {
                    setMore(true);
                  }}
                >
                  Plus
                </button>
              </nav>

              <span className={styles.spacer} />

              <div className={styles.user}>
                {state.status === 'authenticated' && (
                  <span className={styles.username}>{state.username}</span>
                )}
                <Button
                  variant="quiet"
                  onClick={() => {
                    void logout();
                  }}
                >
                  Déconnexion
                </Button>
              </div>
            </div>
          </header>

          {/* La clé change avec l'adresse : c'est ce qui fait rejouer l'animation d'entrée à
          chaque navigation, sans bibliothèque de transition et sans état à tenir. */}
          <main key={pathname} className={cx(styles.main, 'enter')}>
            <Outlet />
          </main>

          <TabBar />
          <MoreSheet
            open={more}
            onClose={() => {
              setMore(false);
            }}
          />
        </div>
      </EveningFlowProvider>
    </MorningFlowProvider>
  );
}

/** Écran d'attente pendant la validation du jeton au démarrage. */
export function SessionLoading() {
  return <div className={styles.loading}>Vérification de la session…</div>;
}

/**
 * Le serveur n'a pas répondu à la vérification du jeton.
 *
 * Un écran et non la coquille : le service worker ne sert jamais `/api` du cache, et
 * chaque écran tomberait en erreur l'un après l'autre. Celui-ci dit la panne une fois,
 * réessaie seul au retour du réseau, et garde le jeton.
 */
export function SessionUnreachable() {
  const { retry } = useAuth();
  return (
    <div className={styles.unreachable} role="alert">
      <p className={styles.unreachableTitle}>Serveur injoignable</p>
      <p className={styles.unreachableText}>
        Ta session est intacte. Metric réessaie dès que le réseau revient.
      </p>
      <Button variant="primary" onClick={retry}>
        Réessayer
      </Button>
    </div>
  );
}
