/**
 * Le panneau du jour (`PLAN-01`, `PLAN-02`) — ce que la grille ne peut pas écrire.
 *
 * Une natation y porte son programme **lu par le serveur**, et, quand elle a eu lieu, la
 * séance nagée réécrite dans la même notation, avec l'écart en mètres
 * (`docs/planning-natation.md` §6.4). Prévu et fait se lisent l'un sous l'autre, dans la
 * même langue : c'est ce qui permet de les comparer d'un coup d'œil.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Card, Empty, ExternalLinkButton, Rule } from '@/components/ui';
import { activityApi } from '@/features/activity/api';
import { planningApi, type DayCell, type PlannedSession } from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { downloadAuthorized } from '@/lib/download';
import { delta, hoursMinutes, longDate, meters } from '@/lib/format';
import { useToast } from '@/lib/toast';

import styles from '../Planning.module.css';
import { RunProgramView } from './RunProgram';
import { SwimDoneView, SwimProgramView } from './SwimProgram';
import { sessionLine, useInvalidatePlanning } from './shared';

/**
 * La note d'une séance, **privée de l'adresse Cadence** qu'elle porte.
 *
 * Ce n'est pas reconnaître le format côté client : le serveur rend `workout_url`, et l'on
 * retire ici une sous-chaîne exacte, connue. La note **stockée** n'est pas touchée — c'est
 * elle qui porte le lien, et le formulaire de correction la recharge entière.
 */
function humanNote(session: PlannedSession): string {
  const note = session.note ?? '';
  if (session.workout_url === null) return note.trim();
  return note.replace(session.workout_url, '').replace(/\s+/g, ' ').trim();
}

function WatchFile({ session }: { session: PlannedSession }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      busy={busy}
      aria-label={`${session.title} : fichier pour la montre (.fit)`}
      onClick={() => {
        setBusy(true);
        downloadAuthorized(
          `/api/planning/sessions/${String(session.id)}/workout.fit`,
          `seance-${session.date}.fit`,
        )
          .catch(() => {
            notify('Le fichier n’a pas pu être préparé.', 'recover');
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      Pour la montre (.fit)
    </Button>
  );
}

/** « Fait : 850 m (+50 m) » — la distance et l'écart arrivent calculés. */
function doneLine(session: PlannedSession): string | null {
  if (session.done_m === null) return null;
  const gap = session.gap_m === null ? '' : ` (${delta(session.gap_m, 0)} m)`;
  return `Nagé : ${meters(session.done_m)}${gap}`;
}

function ImportSwim({ day }: { day: string }) {
  const invalidate = useInvalidatePlanning();
  const { notify } = useToast();
  const [refused, setRefused] = useState<string | null>(null);
  const inputId = `swim-fit-${day}`;

  const upload = useMutation({
    mutationFn: (file: File) => activityApi.importSwimFit(file),
    onSuccess: (swim) => {
      setRefused(null);
      invalidate();
      notify(`Natation importée : ${meters(swim.distance_m)}.`, 'effort');
    },
    onError: (caught: unknown) => {
      setRefused(caught instanceof ApiError ? caught.message : 'Ce fichier n’a pas pu être lu.');
    },
  });

  return (
    <div className={styles.import}>
      <input
        id={inputId}
        type="file"
        accept=".fit,.zip,application/vnd.ant.fit,application/zip"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) upload.mutate(chosen);
          // Remis à zéro : sans cela, réessayer le même fichier après un refus ne
          // déclencherait aucun `change`.
          event.target.value = '';
        }}
      />
      <label htmlFor={inputId} className={styles.download}>
        {upload.isPending ? 'lecture du fichier…' : 'Importer la natation (.fit)'}
      </label>
      {refused !== null && (
        <p className={styles.refused} role="alert">
          {refused}
        </p>
      )}
    </div>
  );
}

export function DayPanel({
  cell,
  onEdit,
  onPlan,
  onOpenSwim,
}: {
  cell: DayCell | undefined;
  onEdit: (session: PlannedSession) => void;
  onPlan: () => void;
  onOpenSwim: (swimId: string) => void;
}) {
  const invalidate = useInvalidatePlanning();
  const { notify } = useToast();
  const [armed, setArmed] = useState<number | null>(null);

  const remove = useMutation({
    mutationFn: ({ id, token }: { id: number; token: string }) => planningApi.remove(id, token),
    onSuccess: () => {
      setArmed(null);
      invalidate();
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
    },
  });

  if (!cell) return null;

  const empty = cell.planned.length === 0 && cell.done.length === 0;
  const awaitingSwim =
    cell.planned.some((item) => item.kind === 'natation') &&
    !cell.done.some((item) => item.kind === 'swim');

  return (
    <Card>
      <div className="spread">
        <h3>{longDate(`${cell.date}T12:00:00`)}</h3>
        <Button variant="primary" onClick={onPlan}>
          Planifier
        </Button>
      </div>

      {empty && (
        <Empty title="Rien ce jour-là">
          Une séance posée à l&apos;avance est une séance qu&apos;on ne discute plus le matin venu.
          Pour une natation, le programme s&apos;écrit une ligne par bloc — 400 CR EF.
        </Empty>
      )}

      {cell.planned.length > 0 && (
        <ul className={styles.list}>
          {cell.planned.map((session) => (
            <li key={session.session_id} className={styles.item}>
              <div className={styles.itemBody}>
                <div className="spread">
                  <strong>{session.title}</strong>
                  {session.source === 'ai' && <Badge tone="signal">proposée</Badge>}
                  {/* Posée par le plan d'une course (`docs/plan-course.md`) : calculée par
                      règles, pas proposée par un modèle — d'où un autre mot que « proposée ». */}
                  {session.source === 'plan' && <Badge tone="effort">plan</Badge>}
                </div>
                <span className={styles.meta}>{sessionLine(session)}</span>

                {session.swim !== null && <SwimProgramView program={session.swim} />}
                {/* Une course écrite en notation, lue par le serveur, et ce qu'elle vise
                    (`docs/planifier-une-seance.md`, D2, D7). */}
                {session.run !== null && <RunProgramView program={session.run} />}
                {/* La séance pour la montre (D10) : à copier par câble ou par l'appli
                    Garmin — sans accès au compte, c'est la voie. */}
                {session.goal_text !== null && (
                  <span className={styles.note}>Visé : {session.goal_text}</span>
                )}
                {session.run !== null && session.run.errors.length === 0 && (
                  <WatchFile session={session} />
                )}
                {doneLine(session) !== null && (
                  <span className={styles.doneLine}>{doneLine(session)}</span>
                )}

                {humanNote(session) !== '' && (
                  <span className={styles.note}>{humanNote(session)}</span>
                )}

                {/* Une séance prévue qui porte un lien Cadence s'ouvre d'ici. L'adresse est
                 **extraite par le serveur**. */}
                {session.workout_url !== null && (
                  <ExternalLinkButton
                    variant="primary"
                    className={styles.openWorkout}
                    href={session.workout_url}
                    aria-label={`Ouvrir ${session.title} dans Cadence`}
                  >
                    Ouvrir dans Cadence
                  </ExternalLinkButton>
                )}
              </div>

              <div className={styles.itemActions}>
                <Button
                  variant="quiet"
                  onClick={() => {
                    onEdit(session);
                  }}
                >
                  Modifier
                </Button>
                {/* Deux appuis pour détruire : le projet n'a pas d'annulation. Le nom
                    accessible désigne **quelle** séance. */}
                <Button
                  variant="quiet"
                  busy={remove.isPending}
                  aria-label={
                    armed === session.id
                      ? `Supprimer ${session.title} — confirmer`
                      : `Supprimer ${session.title} du planning`
                  }
                  onClick={() => {
                    if (armed !== session.id) {
                      setArmed(session.id);
                      return;
                    }
                    remove.mutate({ id: session.id, token: session.token });
                  }}
                >
                  {armed === session.id ? 'Confirmer ?' : 'Retirer'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cell.done.length > 0 && (
        <>
          <Rule>Effectué</Rule>
          <ul className={styles.list}>
            {cell.done.map((activity) => (
              <li key={`${activity.kind}-${String(activity.id)}`} className={styles.item}>
                <div className={styles.itemBody}>
                  <strong>{activity.label}</strong>
                  <span className={styles.meta}>{hoursMinutes(activity.duration_min)}</span>
                  {activity.kind === 'swim' && activity.lines.length > 0 && (
                    <SwimDoneView lines={activity.lines} />
                  )}
                  {activity.suspect_laps > 0 && (
                    <span className={styles.note}>
                      {activity.suspect_laps === 1
                        ? 'Un tour douteux d’après la montre.'
                        : `${String(activity.suspect_laps)} tours douteux d’après la montre.`}
                    </span>
                  )}
                </div>
                {activity.kind === 'swim' && activity.swim_id !== null && (
                  <div className={styles.itemActions}>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        onOpenSwim(activity.swim_id ?? '');
                      }}
                    >
                      Les tours
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {awaitingSwim && <ImportSwim day={cell.date} />}
    </Card>
  );
}
