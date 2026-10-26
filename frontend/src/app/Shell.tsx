import { NavLink, Outlet, useLocation } from 'react-router';

import { Button } from '@/components/ui';
import { IconExit } from '@/components/ui/icons';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { useScrollTop } from '@/lib/scroll';
import { EveningFlowProvider } from '@/routes/evening/EveningFlow';
import { MorningFlowProvider } from '@/routes/morning/MorningFlow';

import styles from './Shell.module.css';
import { TabBar } from './TabBar';

/**
 * Coquille applicative (`L03-09`).
 *
 * **Deux navigations, un seul jeu d'écrans.** Sous 960 px, c'est [`TabBar`](./TabBar.tsx)
 * qui gouverne : cinq cibles en bas de l'écran, là où le pouce est déjà. Au-delà, la barre
 * horizontale ci-dessous reprend la main — une souris n'a pas de zone difficile à
 * atteindre, et un écran large a la place d'afficher neuf entrées d'un coup.
 *
 * **Toutes les destinations, à découvert.** Sur ordinateur, une souris n'a pas de zone
 * difficile à atteindre et l'écran a la place : rien ne se range dans une feuille. La
 * barre a longtemps débordé — onze entrées, 931 px pour 669, « Planning » coupé et la fin
 * hors champ derrière un dégradé (audit du 17 octobre, fiche 27). Un premier correctif
 * avait tout rangé sous « Plus » ; l'utilisateur veut la barre complète.
 *
 * Elle l'est donc, et **ne coupe plus jamais** : elle passe à la ligne quand la fenêtre
 * est trop étroite pour une seule rangée, au lieu de défiler derrière un dégradé. Une
 * entrée à moitié visible se lisait comme un défaut ; une seconde rangée se lit comme une
 * barre.
 *
 * **L'ordre suit la fréquence d'usage** : ce qu'on ouvre tous les jours — l'activité,
 * l'assistant, ce qu'on mange, la routine, le corps —, puis ce qui se pose chaque semaine —
 * le planning, le plan de course, l'objectif —, puis ce qu'on relit et ce qu'on consulte à
 * froid. Ce sont les groupes de la feuille « Plus » (M-12), dans le même ordre.
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
  { to: '/corps', label: 'Corps', end: false },
  { to: '/planning', label: 'Planning', end: false },
  { to: '/plan', label: 'Plan', end: false },
  { to: '/objectif', label: 'Objectif', end: false },
  { to: '/charge', label: 'Charge', end: false },
  { to: '/assiduite', label: 'Assiduité', end: false },
  { to: '/dossier', label: 'Dossier', end: false },
  { to: '/reglages', label: 'Réglages', end: false },
] as const;

export function Shell() {
  const { state, logout } = useAuth();
  const { pathname, hash } = useLocation();

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
              </nav>

              {/* Une icône et non « aleksi · Déconnexion » : les 186 px qu'ils prenaient
                  manquaient à la navigation pour tenir sur une rangée. Le nom du compte
                  reste dans l'infobulle et dans le nom accessible. */}
              <div className={styles.user}>
                <Button
                  variant="quiet"
                  className={styles.exit}
                  aria-label={
                    state.status === 'authenticated'
                      ? `Déconnexion (${state.username})`
                      : 'Déconnexion'
                  }
                  title={
                    state.status === 'authenticated'
                      ? `Connecté comme ${state.username} — se déconnecter`
                      : 'Se déconnecter'
                  }
                  onClick={() => {
                    void logout();
                  }}
                >
                  <IconExit size={18} />
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
