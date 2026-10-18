/** L'abonnement au flux `.ics` (`PLAN-05`). Déplacé de `Planning.tsx`, inchangé. */

import { useQuery } from '@tanstack/react-query';

import { Button, Card } from '@/components/ui';
import { planningApi } from '@/features/planning/api';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from '../Planning.module.css';

export function SubscriptionCard() {
  const { notify } = useToast();
  const { data } = useQuery({
    queryKey: keys.planning.subscription(),
    queryFn: planningApi.subscription,
    staleTime: Infinity,
    retry: false,
  });

  if (!data) return null;

  return (
    <Card>
      <h3>Abonnement calendrier</h3>
      <p className={styles.note}>{data.message}</p>

      {data.url !== null && (
        <div className={styles.subscription}>
          <code className={styles.url}>{data.url}</code>
          <Button
            onClick={() => {
              void navigator.clipboard
                .writeText(data.url ?? '')
                .then(() => {
                  notify('Adresse copiée.', 'signal');
                })
                .catch(() => {
                  notify('Copie impossible — sélectionne l’adresse à la main.', 'recover');
                });
            }}
          >
            Copier l&apos;adresse
          </Button>
        </div>
      )}

      {/* Un lien reste un lien — c'est un téléchargement, pas une action d'application —
          mais il se touche comme un bouton : mesuré à 17 px de haut, il était la seule
          cible de l'écran sous le plancher de `--tap`. */}
      <a className={styles.download} href="/api/planning/export.ics" download>
        Télécharger le planning une fois
      </a>
      <p className={styles.note}>
        Un fichier figé, qui ne se met pas à jour tout seul. Les natations y portent leur programme
        : l&apos;évènement suffit au bord du bassin.
      </p>
    </Card>
  );
}
