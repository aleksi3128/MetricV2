/**
 * La sortie contre la séance prévue ce jour-là (`docs/accueil-et-charge.md`, CA-04).
 *
 * « 5 km sur 5 dans la plage » : le serveur compte et rédige ; l'écran choisit un ton de
 * badge. Rien de prévu, rien d'affiché — une sortie libre n'a rien à respecter, et le dire
 * à chaque fois serait du bruit.
 */

import { useQuery } from '@tanstack/react-query';

import { Badge, Card } from '@/components/ui';
import { activityApi, type Run } from '@/features/activity/api';
import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';

import styles from './Adherence.module.css';

export function Adherence({ run }: { run: Run }) {
  const { data, error } = useQuery({
    queryKey: keys.activity.runAdherence(run.id),
    queryFn: () => activityApi.runAdherence(run.id),
  });

  if (error) {
    return (
      <Card>
        <h3>Séance prévue</h3>
        <p className={styles.text}>
          {error instanceof ApiError
            ? error.message
            : 'Le respect de la séance n’a pas pu être lu.'}
        </p>
      </Card>
    );
  }
  if (data === undefined || !data.planned) return null;

  const all = data.judged_km > 0 && data.in_range_km === data.judged_km;
  return (
    <Card>
      <div className={styles.head}>
        <h3>Séance prévue</h3>
        {data.judged_km > 0 && (
          <Badge mono tone={all ? 'effort' : 'load'}>
            {data.in_range_km}/{data.judged_km} km
          </Badge>
        )}
      </div>
      {data.title !== null && <p className={styles.text}>{data.title}</p>}
      <p className={styles.text}>{data.text}</p>
      {data.caveat !== null && <p className={styles.caveat}>{data.caveat}</p>}
    </Card>
  );
}
