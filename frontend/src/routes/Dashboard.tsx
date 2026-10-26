/**
 * Le tableau de bord.
 *
 * ## Ce que la refonte a changé, et pourquoi
 *
 * L'écran empilait quatre tuiles de poids égal, une carte « Assistant » qui ne contenait
 * que trois boutons, puis une tendance. Il disait **où j'en suis** et jamais **ce que ça
 * vaut**, ni **ce qui vient ensuite** — et rien n'y indiquait quoi regarder en premier.
 *
 * Il se lit maintenant de haut en bas comme une journée :
 *
 * 1. **la lecture du jour** — un message de l'assistant sur la situation du moment, dont
 *    le corps se touche pour lui répondre dans un fil qui commence dessus ;
 * 2. **il reste aujourd'hui** — l'eau, les protéines, les suppléments et la séance prévue,
 *    avec l'écart qui reste sur chacun ;
 * 3. **où je vais** — l'objectif en cours et sa progression, qui n'étaient sur aucun écran
 *    d'accueil.
 *
 * **La rangée « Assistant » en est partie** (M-22). Trois liens — Ouvrir l'assistant,
 * Discussions, Mémoire — tenaient lieu d'entrée sur ordinateur, où la barre du haut n'en
 * avait pas ; elle en a une depuis `320bcfc`, la barre basse aussi, et « Mémoire » est un
 * bouton de l'en-tête de `/assistant`. Les adresses `?ouvre=discussions` et
 * `?ouvre=memoire` restent lues par l'assistant : un favori ou un lien gardé y mène encore.
 *
 * **La tendance et l'entraînement en sont partis** (`docs/pages/modifications.md`, M-06 et
 * M-07). Chacune de leurs lectures redisait un écran de domaine : poids et mensurations
 * `/corps`, eau `/routine`, calories `/nutrition`, volume tous sports `/charge`. Le bas
 * de l'accueil répondait à « comment ça a évolué », que ces écrans disent mieux ; il
 * coûtait les deux tiers du défilement. Le volume de la semaine reste, en un chiffre, dans
 * la bande de `Today`.
 *
 * La carte « Sept derniers jours » a quitté la tendance. Elle redisait en sept cases ce
 * que la bande du jour donne déjà en un chiffre — `Today` affiche la série courante, son
 * record et le nombre de jours suivis — et l'écran entier de `/assiduite` porte la même
 * lecture en plus complet. `Streak.last_seven` reste servi : c'est le contrat `AGG-03`,
 * et plus rien ici ne s'en sert.
 *
 * ## Les trois défauts corrigés au passage
 *
 * * Le conteneur passe à `cx('wrap', styles.screen)`. Il était l'un des huit écrans encore
 *   sur `className="wrap"` seul, dont `.wrap .wrap` masquait la conséquence.
 * * L'histogramme des huit semaines dérivait sa part d'un `Math.max(...weeks.map(…))`.
 *   Un maximum sur une série **est** une dérivation ; `WeekVolume.ratio` est servi.
 * * `data.highlight` était transporté et jamais lu. Il l'est toujours — c'est le réglage
 *   de la piste d'assiduité, il appartient à `/assiduite` — mais plus rien ici ne prétend
 *   s'en servir.
 *
 * ## Ce qui n'a pas bougé
 *
 * **Un seul appel pour les indicateurs** (`AGG-01`). La lecture du jour en ajoute un
 * second, indépendant, avec ses propres quatre états : l'écran peint entièrement sans
 * l'attendre, et la latence d'un modèle n'est jamais payée par les chiffres.
 */

import { useQuery } from '@tanstack/react-query';

import { Empty, PageHead, Skeleton } from '@/components/ui';
import { aggregatesApi } from '@/features/aggregates/api';
import { cx } from '@/lib/cx';
import { longDate } from '@/lib/format';
import { keys } from '@/lib/query';

import { Aim } from './dashboard/Aim';
import { Brief } from './dashboard/Brief';
import { Shape } from './dashboard/Shape';
import { Today } from './dashboard/Today';
import styles from './Dashboard.module.css';

// ── Écran ─────────────────────────────────────────────

export function Dashboard() {
  // **Un seul appel pour les indicateurs** (`AGG-01`) : chiffres du jour, journée à finir,
  // objectif, séance à venir et assiduité arrivent ensemble.
  const { data, isPending, error } = useQuery({
    queryKey: keys.aggregates.dashboard(),
    queryFn: () => aggregatesApi.dashboard(),
  });

  if (isPending) {
    return (
      <div className={cx('wrap', styles.screen)}>
        {/* L'en-tête est là **avant** la donnée. Un écran qui n'affiche qu'un
            « chargement… » sur fond noir ne dit pas où l'on vient d'arriver, et la seconde
            d'attente se lit comme un écran qui n'a pas répondu. */}
        <PageHead eyebrow="Aujourd’hui" title="Tableau de bord" />
        <Skeleton lines={4} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cx('wrap', styles.screen)}>
        <PageHead eyebrow="Aujourd’hui" title="Tableau de bord" />
        <Empty title="Tableau de bord indisponible">
          {error instanceof Error ? error.message : 'Le serveur n’a pas répondu.'}
        </Empty>
      </div>
    );
  }

  return (
    <div className={cx('wrap', styles.screen)}>
      <PageHead eyebrow={longDate(data.date)} title="Tableau de bord" />

      {/* En tête d'écran, et c'est la décision de forme du lot. L'ancienne carte
          d'assistant venait après les chiffres, « parce qu'une question se pose en
          regardant ce qu'on vient de lire » — vrai d'une carte qui ne contenait que des
          boutons. Une lecture qui **dit** quelque chose répond à la question avant qu'on
          la pose, et c'est elle qu'on veut le matin. `AiBlock` existe exactement pour
          qu'un texte proposé puisse se poser là sans se faire prendre pour une mesure. */}
      <Brief />

      <Today data={data} />

      <Shape />

      <Aim data={data} />
    </div>
  );
}
