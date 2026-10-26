/**
 * Les douleurs (`docs/douleurs.md`, D10) — le corps de `/corps/douleurs`.
 *
 * Section du bas de `/corps` jusqu'à M-08 (`docs/pages/modifications.md`) : le bloc que
 * lisent le coach, le matin et le soir arrivait en dernier, sous la pesée et les
 * mensurations. Il a sa sous-page ; `/corps` n'en garde qu'une porte (`PainLink`).
 *
 * Les épisodes ouverts d'abord, avec la réponse graduée telle que le serveur l'a rédigée —
 * l'écran ne juge rien, il choisit seulement un ton de badge sur l'état reçu. Puis la
 * saisie d'une douleur, datée pour pouvoir rattraper l'historique, et les épisodes
 * refermés.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Card, Empty, Rule, Skeleton, SwipeRow } from '@/components/ui';
import { painApi, type PainEntry, type PainEpisode } from '@/features/pain/api';
import { ApiError } from '@/lib/api';
import { shortDate } from '@/lib/format';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Pain.module.css';
import { PainForm } from './PainForm';
import { Patterns } from './Patterns';
import { STATUS, useInvalidatePain } from './shared';

/** Refermées montrées d'emblée : assez pour relire le dernier mois. */
const CLOSED_SHOWN = 5;

function Reports({ episode }: { episode: PainEpisode }) {
  const invalidate = useInvalidatePain();
  const { notify } = useToast();
  const remove = useMutation({
    mutationFn: (entry: PainEntry) => painApi.remove(entry.id, entry.token),
    onSuccess: () => {
      invalidate();
      notify('Relevé supprimé.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
      invalidate();
    },
  });

  return (
    <ul className={styles.reports}>
      {episode.reports.map((entry) => (
        <li key={`${String(entry.id)}-${entry.token}`}>
          <SwipeRow
            actionLabel={`Supprimer le relevé du ${shortDate(entry.date)}`}
            busy={remove.isPending}
            onAction={() => {
              remove.mutate(entry);
            }}
          >
            <div className={styles.report}>
              <span>{entry.summary}</span>
              <span className={styles.reportDate}>{shortDate(entry.date)}</span>
            </div>
          </SwipeRow>
        </li>
      ))}
    </ul>
  );
}

function Episode({ episode, today }: { episode: PainEpisode; today: string }) {
  const [following, setFollowing] = useState(false);
  const status = STATUS[episode.status];

  return (
    <Card>
      <div className={styles.episode}>
        <div className={styles.episodeHead}>
          <h3 className={styles.place}>{episode.title}</h3>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className={styles.text}>{episode.text}</p>
        {episode.status !== 'closed' &&
          (following ? (
            <PainForm
              today={today}
              source="manual"
              episode={episode}
              onDone={() => {
                setFollowing(false);
              }}
            />
          ) : (
            <div className={styles.actions}>
              <Button
                variant={episode.due_today ? 'primary' : 'ghost'}
                onClick={() => {
                  setFollowing(true);
                }}
              >
                {episode.due_today ? 'Noter aujourd’hui' : 'Noter un suivi'}
              </Button>
            </div>
          ))}
        <Reports episode={episode} />
      </div>
    </Card>
  );
}

export function PainSection() {
  const [adding, setAdding] = useState(false);
  const [allClosed, setAllClosed] = useState(false);
  const { notify } = useToast();
  const { data, isPending, error } = useQuery({
    queryKey: keys.body.pain(),
    queryFn: () => painApi.view(),
  });

  const closed = data ? (allClosed ? data.closed : data.closed.slice(0, CLOSED_SHOWN)) : [];

  return (
    <section className={styles.section} aria-label="Douleurs">
      {isPending ? (
        <Card>
          <Skeleton />
        </Card>
      ) : error ? (
        <Card>
          <Empty title="Douleurs indisponibles">
            {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
          </Empty>
        </Card>
      ) : (
        <>
          {data.open.length === 0 && data.closed.length === 0 && !adding && (
            <Card>
              <Empty title="Aucune douleur notée">
                Une gêne se note ici ou à la fin d’un import : le coach en tient compte dès le
                lendemain.
              </Empty>
            </Card>
          )}

          {data.open.length > 0 && <Rule>En cours</Rule>}
          {data.open.map((episode) => (
            <Episode key={episode.pain_id} episode={episode} today={data.today} />
          ))}

          <Card>
            {adding ? (
              <>
                <h3>Nouvelle douleur</h3>
                <PainForm
                  today={data.today}
                  source="manual"
                  zones={data.zones}
                  baselines={data.baselines}
                  dated
                  onDone={(saved) => {
                    setAdding(false);
                    notify(`Douleur notée ${saved.place}.`, 'signal');
                  }}
                />
                <Button
                  variant="quiet"
                  onClick={() => {
                    setAdding(false);
                  }}
                >
                  Annuler
                </Button>
              </>
            ) : (
              <Button
                onClick={() => {
                  setAdding(true);
                }}
              >
                Noter une douleur
              </Button>
            )}
          </Card>

          <Patterns today={data.today} />

          {closed.length > 0 && <Rule>Refermées</Rule>}
          {closed.map((episode) => (
            <Episode key={episode.pain_id} episode={episode} today={data.today} />
          ))}
          {!allClosed && data.closed.length > CLOSED_SHOWN && (
            <Button
              variant="quiet"
              onClick={() => {
                setAllClosed(true);
              }}
            >
              Toutes les douleurs refermées ({data.closed.length})
            </Button>
          )}
        </>
      )}
    </section>
  );
}
