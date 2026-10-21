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

import {
  Button,
  Chip,
  ChipStrip,
  Empty,
  Field,
  Segmented,
  Sheet,
  Skeleton,
  Stepper,
} from '@/components/ui';
import { activityApi, type SwimDetail, type SwimLap } from '@/features/activity/api';
import { planningApi } from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { dayMonth, hoursMinutes, meters, swimClock } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import { RateEffort } from '../activity/run/Rate';
import styles from '../Planning.module.css';
import edits from './SwimEdit.module.css';
import { SwimDoneView } from './SwimProgram';

function swimKey(swimId: string) {
  return [...keys.planning.all(), 'swim', swimId] as const;
}

/** `105` → `1:45` : le temps d'un tour tel qu'on le retape. */
function clockOf(seconds: number): string {
  const total = Math.round(seconds);
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Un tour : sa ligne, et dépliée, de quoi le corriger (`docs/natation-corriger.md`, D1).
 * La distance avance d'une longueur de bassin ; le temps se retape (`1:45`) ; la nage se
 * choisit d'un appui. Fusionner recolle le tour suivant ; retirer demande deux appuis.
 */
function LapRow({
  lap,
  next,
  pool,
  strokes,
  onSaved,
}: {
  lap: SwimLap;
  /** Le tour qui suit, s'il y en a un : fusionner n'a de sens qu'avec un tour de nage. */
  next: SwimLap | undefined;
  pool: number;
  strokes: { code: string; label: string }[];
  onSaved: (detail: SwimDetail) => void;
}) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [distance, setDistance] = useState(String(lap.distance_m));
  const [duration, setDuration] = useState(clockOf(lap.duration_s));

  function failed(caught: unknown): void {
    notify(caught instanceof ApiError ? caught.message : 'Correction impossible.', 'recover');
  }

  const correct = useMutation({
    mutationFn: (stroke: string | null) => activityApi.correctSwimLap(lap.id, lap.token, stroke),
    onSuccess: onSaved,
    onError: failed,
  });
  const edit = useMutation({
    mutationFn: () =>
      activityApi.editSwimLap(lap.id, lap.token, {
        ...(Number(distance) !== lap.distance_m && lap.kind === 'swim'
          ? { distance_m: Number(distance) }
          : {}),
        ...(duration !== clockOf(lap.duration_s) ? { duration } : {}),
      }),
    onSuccess: (detail) => {
      setOpen(false);
      onSaved(detail);
    },
    onError: failed,
  });
  const merge = useMutation({
    mutationFn: () => activityApi.mergeSwimLap(lap.id, lap.token),
    onSuccess: (detail) => {
      setOpen(false);
      onSaved(detail);
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: () => activityApi.deleteSwimLap(lap.id, lap.token),
    onSuccess: (detail) => {
      setOpen(false);
      setArmed(false);
      onSaved(detail);
    },
    onError: failed,
  });

  const swimming = lap.kind === 'swim';
  const read = lap.detected.length > 0 ? lap.detected.join(' ') : '—';
  const changed = Number(distance) !== lap.distance_m || duration !== clockOf(lap.duration_s);

  return (
    <li className={swimming ? styles.lap : styles.lapRest}>
      <button
        type="button"
        className={styles.lapHead}
        aria-expanded={open}
        aria-label={
          swimming
            ? `Tour ${String(lap.seq)} : ${meters(lap.distance_m)}, ${
                lap.stroke ?? `lu ${read}`
              } — corriger`
            : `Repos ${swimClock(lap.duration_s)} — corriger`
        }
        onClick={() => {
          setOpen((current) => !current);
          setArmed(false);
        }}
      >
        {swimming ? (
          <>
            <span className={styles.lapMain}>
              {meters(lap.distance_m)} · {swimClock(lap.duration_s)}
              {lap.suspect && <span className={styles.lapFlag}>douteux</span>}
            </span>
            <span className={styles.lapStroke}>{lap.stroke ?? `lu : ${read}`}</span>
          </>
        ) : (
          <span>repos {swimClock(lap.duration_s)}</span>
        )}
      </button>

      {open && (
        <div className={edits.form}>
          <div className={edits.pair}>
            {swimming && (
              <Stepper
                label="Distance (m)"
                value={distance}
                step={pool}
                min={pool}
                max={5000}
                onChange={setDistance}
              />
            )}
            <Field
              label="Temps"
              value={duration}
              placeholder="1:45"
              hint="m:ss"
              onChange={(event) => {
                setDuration(event.target.value);
              }}
            />
          </div>

          {swimming && (
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
          )}

          <div className={edits.actions}>
            <Button
              variant="primary"
              busy={edit.isPending}
              disabled={!changed}
              onClick={() => {
                edit.mutate();
              }}
            >
              Enregistrer le tour
            </Button>
            {swimming && next?.kind === 'swim' && (
              <Button
                variant="ghost"
                busy={merge.isPending}
                onClick={() => {
                  merge.mutate();
                }}
              >
                Fusionner avec le suivant
              </Button>
            )}
            {/* Deux appuis pour détruire : le projet n'a aucune annulation. */}
            <Button
              variant="quiet"
              className={edits.danger}
              busy={remove.isPending}
              aria-label={
                armed
                  ? `Retirer le tour ${String(lap.seq)} — confirmer`
                  : `Retirer le tour ${String(lap.seq)}`
              }
              onClick={() => {
                if (!armed) {
                  setArmed(true);
                  return;
                }
                remove.mutate();
              }}
            >
              {armed ? 'Confirmer le retrait ?' : 'Retirer ce tour'}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Date, heure, bassin, note : ce qui entoure une natation importée, sans rien de mesuré. */
function MetaForm({ swim, onSaved }: { swim: SwimDetail; onSaved: (detail: SwimDetail) => void }) {
  const { notify } = useToast();
  const [values, setValues] = useState({
    date: swim.date,
    start: swim.start === null ? '' : swim.start.slice(0, 5),
    pool: String(swim.pool_m === 50 ? 50 : 25) as '25' | '50',
    note: swim.note ?? '',
  });
  const save = useMutation({
    mutationFn: () =>
      activityApi.updateSwimMeta(swim.id, swim.token, {
        date: values.date,
        start: values.start === '' ? null : values.start,
        pool_m: Number(values.pool),
        note: values.note.trim() === '' ? null : values.note,
      }),
    onSuccess: (detail) => {
      notify('Séance corrigée.', 'effort');
      onSaved(detail);
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Correction impossible.', 'recover');
    },
  });
  return (
    <div className={edits.form}>
      <div className={edits.pair}>
        <Field
          label="Date"
          type="date"
          value={values.date}
          onChange={(event) => {
            setValues({ ...values, date: event.target.value });
          }}
        />
        <Field
          label="Heure"
          type="time"
          value={values.start}
          onChange={(event) => {
            setValues({ ...values, start: event.target.value });
          }}
        />
      </div>
      <Segmented
        label="Bassin"
        options={POOLS}
        value={values.pool}
        onChange={(pool) => {
          setValues({ ...values, pool });
        }}
      />
      <Field
        label="Note"
        value={values.note}
        placeholder="lignes 4, eau froide"
        onChange={(event) => {
          setValues({ ...values, note: event.target.value });
        }}
      />
      <Button
        variant="primary"
        busy={save.isPending}
        onClick={() => {
          save.mutate();
        }}
      >
        Enregistrer la séance
      </Button>
    </div>
  );
}

const POOLS = [
  { value: '25', label: 'Bassin de 25 m' },
  { value: '50', label: 'Bassin de 50 m' },
] as const;

export function SwimSheet({
  swimId,
  onClose,
  onEdit,
}: {
  swimId: string | null;
  onClose: () => void;
  /**
   * Corriger une natation **saisie** : l'écran qui ouvre la feuille fournit le formulaire.
   * Absent — au planning —, le bouton ne s'affiche pas ; une importée se corrige au tour.
   */
  onEdit?: ((swim: SwimDetail) => void) | undefined;
}) {
  const client = useQueryClient();
  const { notify } = useToast();
  const [armed, setArmed] = useState(false);
  const [correcting, setCorrecting] = useState(false);

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

          {/* L'effort perçu : sans lui, la nage ne compte pas dans la charge globale
              (`docs/charge-multisport.md`, D9). */}
          <h4 className={styles.sheetHeading}>Effort perçu</h4>
          <RateEffort
            current={data.rpe}
            rate={(rpe) => activityApi.setSwimRpe(data.id, data.token, rpe)}
            onRated={refresh}
          />

          {data.note !== null && <p className={styles.note}>{data.note}</p>}

          {/* Une natation **saisie** se corrige d'un bloc, par le formulaire qui l'a écrite.
              Une importée se corrige au tour, ses réglages ici — et se réécrit entière en
              notation, ce qui remplace ses tours (`docs/natation-corriger.md`). */}
          {data.source === 'manual' && onEdit !== undefined && (
            <Button
              variant="ghost"
              onClick={() => {
                onEdit(data);
              }}
            >
              Corriger la séance
            </Button>
          )}
          {data.source !== 'manual' && (
            <div className={edits.actions}>
              <Button
                variant="ghost"
                aria-expanded={correcting}
                onClick={() => {
                  setCorrecting(!correcting);
                }}
              >
                {correcting ? 'Fermer' : 'Corriger la séance'}
              </Button>
              {onEdit !== undefined && (
                <Button
                  variant="quiet"
                  onClick={() => {
                    onEdit(data);
                  }}
                >
                  Réécrire en notation
                </Button>
              )}
            </div>
          )}
          {correcting && data.source !== 'manual' && (
            <MetaForm
              key={data.token}
              swim={data}
              onSaved={(detail) => {
                setCorrecting(false);
                refresh(detail);
              }}
            />
          )}

          {data.laps.length > 0 && (
            <>
              <h4 className={styles.sheetHeading}>Tour par tour</h4>
              <p className={styles.note}>
                Touche un tour pour corriger sa distance, son temps ou sa nage — « lu » est ce que
                la montre a cru voir. La séance reprend ses totaux de ses tours.
              </p>
              <ol className={styles.laps}>
                {data.laps.map((lap, index) => (
                  <LapRow
                    key={`${String(lap.id)}-${lap.token}`}
                    lap={lap}
                    next={data.laps[index + 1]}
                    pool={data.pool_m}
                    strokes={strokes}
                    onSaved={refresh}
                  />
                ))}
              </ol>
            </>
          )}

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
