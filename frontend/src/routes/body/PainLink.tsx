/**
 * La porte des douleurs, en tête de `/corps` (`docs/pages/modifications.md`, M-08).
 *
 * Les douleurs ont quitté le bas de l'écran pour `/corps/douleurs`. Une porte qui ne dirait
 * que « Douleurs » cacherait ce qu'on vient chercher pendant un épisode ; elle nomme donc
 * chaque épisode ouvert, l'état que le serveur lui donne, et si son suivi est dû
 * aujourd'hui. Elle lit la même requête que la sous-page : l'ouvrir ne relit rien.
 *
 * La porte existe dans les quatre états — une lecture en panne ne ferme pas la sous-page,
 * qui dira elle-même pourquoi elle est vide.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { Badge, Skeleton } from '@/components/ui';
import { painApi } from '@/features/pain/api';
import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';

import styles from './Pain.module.css';
import { STATUS } from './shared';

export function PainLink() {
  const { data, isPending, error } = useQuery({
    queryKey: keys.body.pain(),
    queryFn: () => painApi.view(),
  });

  return (
    <Link className={styles.door} to="/corps/douleurs">
      <span className={styles.doorHead}>
        <span>Douleurs</span>
        <span aria-hidden="true">›</span>
      </span>
      {isPending ? (
        <Skeleton lines={1} />
      ) : error ? (
        <span className={styles.text}>
          {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
        </span>
      ) : data.open.length === 0 ? (
        <span className={styles.text}>Aucune douleur en cours.</span>
      ) : (
        <ul className={styles.doorEpisodes}>
          {data.open.map((episode) => (
            <li key={episode.pain_id} className={styles.doorEpisode}>
              <span>{episode.title}</span>
              <Badge tone={STATUS[episode.status].tone}>{STATUS[episode.status].label}</Badge>
              {episode.due_today && (
                <span className={styles.doorDue}>suivi à noter aujourd’hui</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
