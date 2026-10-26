/**
 * `/corps/douleurs` — les douleurs à leur adresse (`docs/pages/modifications.md`, M-08).
 *
 * Une sous-page comme celles d'Activité : sans entrée de navigation, on y arrive par la
 * porte en tête de `/corps`, par une alerte de douleur de l'accueil ou par le rappel de
 * suivi — les deux adresses que le serveur sert. Être une route lui donne le bouton
 * système « précédent », qui ramène d'où l'on vient.
 *
 * Le parcours du matin et le point du soir gardent leurs propres formulaires : seule la
 * section de `/corps` a déménagé.
 */

import { LinkButton, PageHead } from '@/components/ui';
import { cx } from '@/lib/cx';

import styles from '../Body.module.css';
import { PainSection } from './Pain';

export function Pains() {
  return (
    <div className={cx('wrap', styles.screen)}>
      <PageHead
        eyebrow="Domaine Corps"
        title="Douleurs"
        actions={
          <LinkButton variant="quiet" to="/corps">
            Retour au corps
          </LinkButton>
        }
      >
        Ce que le coach lit avant chaque séance : les épisodes en cours, leur suivi, et ce qui va
        avec.
      </PageHead>

      <PainSection />
    </div>
  );
}
