import { Segmented, Sheet } from '@/components/ui';

import { OffDays } from './OffDays';
import { Tracks } from './Tracks';
import styles from './TracksSheet.module.css';

export type TracksTab = 'pistes' | 'jours';

const TABS = [
  { value: 'pistes', label: 'Pistes' },
  { value: 'jours', label: 'Jours neutralisés' },
] as const;

/**
 * « Régler les pistes » — la feuille de `/assiduite` (M-04).
 *
 * Les pistes, leurs cadences et leurs seuils, la piste mise en avant et les jours
 * neutralisés vivaient dans `/reglages`, et l'en-tête de `/assiduite` y renvoyait en haut
 * d'une page de 9 785 px. Ils se règlent désormais d'ici, en regardant la grille qu'ils
 * règlent — la feuille la laisse en place, et la grille se relit à chaque écriture.
 *
 * Deux onglets plutôt qu'une longue colonne, comme la feuille du carnet : dix pistes et le
 * formulaire d'une plage ne se lisent pas ensemble. **Les deux restent montés** pendant que
 * la feuille est ouverte : une plage en cours de saisie survit à un coup d'œil aux pistes.
 *
 * Le champ texte « Clé de la piste », que `/reglages` portait à côté, n'a pas suivi :
 * « Mettre en avant », sur chaque piste, écrit le même réglage (`heatmap_metric`) sans
 * demander d'identifiant.
 */
export function TracksSheet({
  open,
  onClose,
  tab,
  onTab,
}: {
  open: boolean;
  onClose: () => void;
  tab: TracksTab;
  onTab: (tab: TracksTab) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Régler les pistes"
      lede="Ce que chaque grille attend, et les jours qui ne comptent pas."
    >
      <Segmented label="Régler les pistes" value={tab} onChange={onTab} options={TABS} />

      <div hidden={tab !== 'pistes'} className={styles.panel}>
        <Tracks />
      </div>

      <div hidden={tab !== 'jours'} className={styles.panel}>
        <OffDays />
      </div>
    </Sheet>
  );
}
