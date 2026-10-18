/**
 * Une natation faite, tour par tour (`docs/planning-natation.md` §6).
 *
 * La montre se trompe de deux façons, et cette feuille dit les deux sans en corriger
 * aucune d'elle-même : une longueur **coupée en deux** rend un tour « douteux » — la
 * distance reste la sienne —, et une nage **mal lue** reste une lecture, que l'on confirme
 * ou corrige au tour d'un appui. La lecture de la montre n'est jamais écrasée : le serveur
 * garde les deux.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Chip, ChipStrip, Empty, Sheet, Skeleton } from '@/components/ui';
import { activityApi, type SwimDetail, type SwimLap } from '@/features/activity/api';
import { planningApi } from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { dayMonth, hoursMinutes, meters, swimClock } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from '../Planning.module.css';
import { SwimDoneView } from './SwimProgram';

function swimKey(swimId: string) {
  return [...keys.planning.all(), 'swim', swimId] as const;
}

function LapRow({
  lap,
  strokes,
  onSaved,
}: {
  lap: SwimLap;
  strokes: { code: string; label: string }[];
  onSaved: (detail: SwimDetail) => void;
}) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);

  const correct = useMutation({
    mutationFn: (stroke: string | null) => activityApi.correctSwimLap(lap.id, lap.token, stroke),
    onSuccess: (detail) => {
      setOpen(false);
      onSaved(detail);
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Correction impossible.', 'recover');
    },
  });

  if (lap.kind === 'rest') {
    return <li className={styles.lapRest}>repos {swimClock(lap.duration_s)}</li>;
  }

  const read = lap.detected.length > 0 ? lap.detected.join(' ') : '—';

  return (
    <li className={styles.lap}>
      <button
        type="button"
        className={styles.lapHead}
        aria-expanded={open}
        aria-label={`Tour ${String(lap.seq)} : ${meters(lap.distance_m)}, ${
          lap.stroke ?? `lu ${read}`
        } — corriger la nage`}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span className={styles.lapMain}>
          {meters(lap.distance_m)} · {swimClock(lap.duration_s)}
          {lap.suspect && <span className={styles.lapFlag}>douteux</span>}
        </span>
        <span className={styles.lapStroke}>{lap.stroke ?? `lu : ${read}`}</span>
      </button>

      {open && (
        <div className={styles.lapEdit}>
          <ChipStrip label={`Nage du tour ${String(lap.seq)}`}>
            {strokes.map((stroke) => (
              <Chip
                key={stroke.code}
                selected={lap.stroke === stroke.code}
                onClick={() => {
                  correct.mutate(stroke.code);
                }}
              >
                {stroke.code}
              </Chip>
            ))}
            {lap.stroke !== null && (
              <Chip
                onClick={() => {
                  correct.mutate(null);
                }}
              >
                lecture de la montre
              </Chip>
            )}
          </ChipStrip>
        </div>
      )}
    </li>
  );
}

export function SwimSheet({ swimId, onClose }: { swimId: string | null; onClose: () => void }) {
  const client = useQueryClient();
  const { notify } = useToast();
  const [armed, setArmed] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: swimKey(swimId ?? ''),
    queryFn: () => activityApi.swim(swimId ?? ''),
    enabled: swimId !== null,
  });
  const { data: glossary } = useQuery({
    queryKey: keys.planning.swimCodes(),
    queryFn: planningApi.swimCodes,
    enabled: swimId !== null,
  });
  const strokes = (glossary?.codes ?? []).filter((code) => code.category === 'stroke');

  function refresh(detail?: SwimDetail): void {
    if (detail !== undefined) client.setQueryData(swimKey(detail.swim_id), detail);
    void client.invalidateQueries({ queryKey: keys.planning.all() });
    void client.invalidateQueries({ queryKey: keys.activity.all() });
    for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
  }

  const remove = useMutation({
    mutationFn: (detail: SwimDetail) => activityApi.deleteSwim(detail.id, detail.token),
    onSuccess: () => {
      setArmed(false);
      refresh();
      notify('Natation supprimée.', 'signal');
      onClose();
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
    },
  });

  const lede =
    data === undefined
      ? undefined
      : [
          meters(data.distance_m),
          hoursMinutes(data.duration_s / 60),
          data.pace_100_s === null ? null : `${swimClock(data.pace_100_s)} /100 m`,
          data.avg_hr === null ? null : `FC ${String(data.avg_hr)}`,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <Sheet
      open={swimId !== null}
      onClose={() => {
        setArmed(false);
        onClose();
      }}
      title={data === undefined ? 'Natation' : `Natation du ${dayMonth(`${data.date}T12:00:00`)}`}
      lede={lede}
    >
      {isPending && <Skeleton lines={4} />}

      {error !== null && (
        <Empty title="Natation illisible">
          {error instanceof ApiError ? error.message : 'Le serveur est injoignable.'}
        </Empty>
      )}

      {data !== undefined && (
        <div className={styles.swimSheet}>
          {data.suspect_laps > 0 && (
            <p className={styles.note}>
              {data.suspect_laps === 1
                ? 'Un tour porte une longueur douteuse'
                : `${String(data.suspect_laps)} tours portent une longueur douteuse`}{' '}
              — comptée deux fois par la montre, le plus souvent. La distance reste la sienne.
            </p>
          )}

          <SwimDoneView lines={data.lines} />

          <h4 className={styles.sheetHeading}>Tour par tour</h4>
          <p className={styles.note}>
            « lu » : la nage que la montre a cru voir. Touche un tour pour la confirmer ou la
            corriger.
          </p>
          <ol className={styles.laps}>
            {data.laps.map((lap) => (
              <LapRow key={lap.id} lap={lap} strokes={strokes} onSaved={refresh} />
            ))}
          </ol>

          {/* Deux appuis pour détruire : le projet n'a aucune annulation, et la séance part
              avec ses tours et son fichier. */}
          <Button
            variant="quiet"
            className={cx(styles.danger, armed && styles.dangerArmed)}
            busy={remove.isPending}
            aria-label={armed ? 'Supprimer cette natation — confirmer' : 'Supprimer cette natation'}
            onClick={() => {
              if (!armed) {
                setArmed(true);
                return;
              }
              remove.mutate(data);
            }}
          >
            {armed ? 'Confirmer la suppression ?' : 'Supprimer cette natation'}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
