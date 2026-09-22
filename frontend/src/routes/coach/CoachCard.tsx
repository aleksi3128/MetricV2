/**
 * La séance que le coach propose (`docs/coach-course.md` §7).
 *
 * **Deux natures de texte, deux vêtements.** Ce que le modèle a écrit — le choix et son
 * explication — est une proposition : il porte `AiBlock`, et rien d'autre ne le porte. Les
 * cibles, le cadre et l'allègement du matin sortent de règles fixes : ils s'affichent comme
 * des faits. Une cinquième façon de dire « proposé » affaiblirait les quatre qui existent.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AiBlock, Button, Card, Empty, Markdown, Rule, Skeleton } from '@/components/ui';
import type { ReactNode } from 'react';
import { coachApi, type CoachNext, type CoachStep, type CoachView } from '@/features/coach/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { downloadAuthorized } from '@/lib/download';
import { duration, longDate, num } from '@/lib/format';
import { keys } from '@/lib/query';

import styles from './Coach.module.css';

function stepLength(step: CoachStep): string | null {
  if (step.duration_s !== null) {
    // « 35 min » et non « 35:00 » : une consigne se dit en minutes rondes ; seules les
    // durées qui tombent entre deux minutes gardent leurs secondes.
    return step.duration_s % 60 === 0
      ? `${String(step.duration_s / 60)} min`
      : duration(step.duration_s / 60);
  }
  if (step.distance_m !== null) {
    return step.distance_m >= 1000
      ? `${num(step.distance_m / 1000, 1)} km`
      : `${String(step.distance_m)} m`;
  }
  return null;
}

export function CoachSteps({ steps }: { steps: readonly CoachStep[] }) {
  return (
    <ol className={styles.steps}>
      {steps.map((step, index) => (
        <li key={`${String(index)}-${step.label}`} className={cx(styles.step, styles[step.kind])}>
          <span className={styles.stepLabel}>
            {step.repeat !== null && <b>{step.repeat} × </b>}
            {step.label}
            {stepLength(step) !== null && <small> · {stepLength(step)}</small>}
          </span>
          {step.target !== null && <span className={styles.stepTarget}>{step.target}</span>}
        </li>
      ))}
    </ol>
  );
}

/** Le résumé : ce que le parcours du matin et la page d'une sortie montrent d'abord. */
export function CoachSummary({ coach }: { coach: CoachView }) {
  return (
    <div className={styles.summary}>
      {coach.adjusted !== null && <p className={styles.adjusted}>{coach.adjusted}</p>}
      <div className={styles.head}>
        <strong className={styles.title}>{coach.title}</strong>
        <small>
          {longDate(coach.date)}
          {coach.time !== null ? ` · ${coach.time}` : ''}
          {/* « 0 min » ne dit rien d'un jour sans course. */}
          {coach.duration_min > 0 ? ` · ${String(coach.duration_min)} min` : ''}
        </small>
      </div>
      <CoachSteps steps={coach.steps} />
      {coach.source === 'model' ? (
        <AiBlock tag="Proposé par l’assistant">
          {/* Le gras que la consigne demande sur les chiffres : rendu, pas montré en
              astérisques — la forme de la lecture du jour (`GuidelinesUI.html` §10). */}
          <div className={styles.rationale}>
            <Markdown>{coach.rationale}</Markdown>
          </div>
        </AiBlock>
      ) : (
        <p className={styles.rules}>{coach.rationale}</p>
      )}
    </div>
  );
}

/** Pendant qu'une proposition se prépare, juste après un import : relire toutes les 3 s. */
const PENDING_POLL_MS = 3000;

/**
 * La carte entière : la proposition, pourquoi ce cadre, et ce qu'on en fait.
 *
 * `forRun` : sur la page d'une sortie, la carte ne montre que la proposition **née de
 * cette sortie** — celle d'une autre sortie y serait hors de propos.
 */
export function CoachCard({
  forRun,
  rule,
}: {
  forRun?: string | undefined;
  /** L'intertitre, posé par la carte : absente, elle ne laisse pas un titre orphelin. */
  rule?: string | undefined;
}) {
  const client = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: keys.coach.next(),
    queryFn: () => coachApi.next(),
    refetchInterval: (query) => (query.state.data?.pending ? PENDING_POLL_MS : false),
  });
  const [downloadFailed, setDownloadFailed] = useState(false);

  const settle = (next: CoachNext) => {
    client.setQueryData(keys.coach.next(), next);
    // Accepter écrit au planning, et le parcours du matin montre la séance.
    for (const key of [keys.planning.all(), keys.morning.all()]) {
      void client.invalidateQueries({ queryKey: key });
    }
  };
  const accept = useMutation({ mutationFn: () => coachApi.accept(), onSuccess: settle });
  const refuse = useMutation({ mutationFn: () => coachApi.refuse(), onSuccess: settle });
  const refresh = useMutation({ mutationFn: () => coachApi.refresh(), onSuccess: settle });
  const failure = accept.error ?? refuse.error ?? refresh.error;
  const framed = (card: ReactNode) => (
    <>
      {rule !== undefined && <Rule>{rule}</Rule>}
      {card}
    </>
  );

  if (error !== null) {
    return framed(
      <Card>
        <Empty title="Coach indisponible">
          {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
        </Empty>
      </Card>,
    );
  }
  if (isPending) {
    // Sur la page d'une sortie, rien tant qu'on ne sait pas : un intertitre et un squelette
    // posés pour une proposition qui se révèle être celle d'une autre sortie disparaissaient
    // aussitôt, et la page sautait. Trouvé par un test, pas à l'œil.
    if (forRun !== undefined) return null;
    return framed(
      <Card>
        <Skeleton lines={3} />
      </Card>,
    );
  }

  const current = data.current;
  if (forRun !== undefined && current !== null && current.trigger_run_id !== forRun) return null;
  if (forRun !== undefined && current === null && !data.pending) return null;

  if (current === null) {
    return framed(
      <Card>
        {data.pending ? (
          <div className={styles.waiting} aria-live="polite">
            <Skeleton lines={2} />
            <p className={styles.rules}>{data.missing}</p>
          </div>
        ) : (
          <>
            <Empty title="Pas de séance proposée">{data.missing ?? ''}</Empty>
            <Button
              variant="ghost"
              busy={refresh.isPending}
              onClick={() => {
                refresh.mutate();
              }}
            >
              Demander une proposition
            </Button>
          </>
        )}
      </Card>,
    );
  }

  return framed(
    <Card>
      <CoachSummary coach={current} />

      {current.frame.length > 0 && (
        <details className={styles.frame}>
          <summary>Le cadre de ce choix</summary>
          <ul>
            {current.frame.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      )}

      {failure !== null && (
        <p className={styles.error} role="alert">
          {failure instanceof ApiError ? failure.message : 'Le serveur n’a pas répondu.'}
        </p>
      )}

      <div className={styles.actions}>
        {current.status === 'accepted' ? (
          <p className={styles.accepted}>Au planning, {longDate(current.date)}.</p>
        ) : current.type === 'rest' ? (
          // Un jour sans course ne se cale pas au planning : il n'y a rien à y mettre.
          <p className={styles.rules}>Rien à caler : c’est un jour sans course.</p>
        ) : (
          <>
            <Button
              variant="primary"
              className={styles.accept}
              busy={accept.isPending}
              onClick={() => {
                accept.mutate();
              }}
            >
              Accepter au planning
            </Button>
            <Button
              variant="ghost"
              busy={refuse.isPending}
              onClick={() => {
                refuse.mutate();
              }}
            >
              Refuser
            </Button>
          </>
        )}
        {current.workout && (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setDownloadFailed(false);
                downloadAuthorized(coachApi.workoutPath, `seance-${current.date}.fit`).catch(() => {
                  setDownloadFailed(true);
                });
              }}
            >
              {downloadFailed ? 'Fichier indisponible — réessayer' : 'Fichier pour la montre'}
            </Button>
            <p className={styles.rules}>
              À copier dans GARMIN/NewFiles, par câble — OpenMTP sur Mac. La montre te guidera et
              bipera hors de la cible.
            </p>
          </>
        )}
        <Button
          variant="quiet"
          busy={refresh.isPending}
          onClick={() => {
            refresh.mutate();
          }}
        >
          Autre proposition
        </Button>
      </div>
    </Card>,
  );
}
