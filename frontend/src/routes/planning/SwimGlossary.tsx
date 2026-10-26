import { LinkButton, PageHead } from '@/components/ui';
import { cx } from '@/lib/cx';

import { SwimCodes } from './SwimCodes';
import styles from './SwimGlossary.module.css';

/**
 * `/planning/sigles` — le glossaire de la notation de nage, sur sa propre page (M-04).
 *
 * Une sous-page et non une feuille : on y vient pour renommer ou ajouter un sigle, pas au
 * milieu d'une saisie. Les deux pages qui écrivent en notation, `/planning` et
 * `/activite/natations`, y mènent depuis leur pied ; le retour ramène au planning, qui
 * l'emploie le plus.
 */
export function SwimGlossary() {
  return (
    <div className={cx('wrap', styles.screen)}>
      <PageHead
        eyebrow="Planning"
        title="Les sigles de nage"
        actions={
          <LinkButton variant="quiet" to="/planning">
            Retour au planning
          </LinkButton>
        }
      >
        Les nages, les allures et le matériel que la notation emploie. Un sigle de base se renomme
        et se rétablit ; un sigle ajouté se corrige et se retire, s’il ne sert à aucune séance.
      </PageHead>

      <SwimCodes />
    </div>
  );
}
