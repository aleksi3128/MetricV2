/**
 * Planifier ou corriger une séance (`PLAN-02`, `docs/planifier-une-seance.md`), dans une
 * feuille.
 *
 * Elle était une carte posée sous le panneau du jour. Avec un programme de nage à écrire,
 * elle repoussait la grille hors de l'écran — or c'est en regardant la semaine qu'on
 * décide quoi y mettre. La feuille garde la page en place dessous.
 *
 * ## Rien d'imposé (D8)
 *
 * Elle partait de « natation, 60 minutes ». La date vient maintenant du jour touché, et
 * rien d'autre : la nature se choisit, la durée aussi — sauf pour une course écrite en
 * notation, dont le serveur déduit la durée des blocs.
 *
 * ## La notation
 *
 * Une natation s'écrit une ligne par bloc (`docs/planning-natation.md` §2), une course en
 * blocs et groupes (`15' EF + 5 × (1 km 6'00 + 80 m LD 3'30)`). **L'écran ne lit ni
 * l'une ni l'autre** : il envoie le texte, le serveur rend les blocs réécrits et le total,
 * ou la faute.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Chip, ChipStrip, Field, Sheet, Stepper } from '@/components/ui';
import {
  planningApi,
  type PlanBody,
  type PlanFormValues,
  type PlannedSession,
} from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';

import styles from '../Planning.module.css';
import { ProgramField } from './ProgramField';
import { RunProgramField } from './RunProgram';
import own from './RunProgram.module.css';
import { KIND_OPTIONS, useInvalidatePlanning } from './shared';

/** « 9,5 » → 9.5 ; vide → `null`. La virgule du clavier français, pas un calcul. */
function decimal(raw: string | null | undefined): number | null {
  const cleaned = (raw ?? '').trim().replace(',', '.');
  return cleaned === '' ? null : Number(cleaned);
}

function bodyOf(values: PlanFormValues & { kind: NonNullable<PlanFormValues['kind']> }): PlanBody {
  const running = values.kind === 'course';
  const written = values.kind === 'natation' || running;
  return {
    date: values.date,
    time: values.time,
    kind: values.kind,
    title: values.title,
    duration_min: decimal(values.duration_min),
    note: values.note ?? null,
    // Un programme ne part qu'avec la nature qui le lit : changer de nature en cours de
    // saisie ne doit pas faire refuser la séance pour un champ qu'on ne voit plus.
    program: written ? values.program || null : null,
    distance_km: running ? decimal(values.distance_km) : null,
    goal_time: running ? values.goal_time || null : null,
    rpe_goal: running ? (values.rpe_goal ?? null) : null,
  };
}

export function PlanSheet({
  values,
  editing,
  onChange,
  onDone,
}: {
  /** `null` : la feuille est fermée. */
  values: PlanFormValues | null;
  editing: PlannedSession | null;
  onChange: (values: PlanFormValues) => void;
  onDone: () => void;
}) {
  const invalidate = useInvalidatePlanning();
  const { notify } = useToast();
  const [error, setError] = useState<ApiError | null>(null);
  const [missing, setMissing] = useState<string | null>(null);

  const swimming = values?.kind === 'natation';
  const running = values?.kind === 'course';

  const save = useMutation({
    mutationFn: (payload: PlanBody) =>
      editing
        ? planningApi.update(editing.id, editing.token, payload)
        : planningApi.create(payload),
    onSuccess: () => {
      setError(null);
      invalidate();
      onDone();
    },
    onError: (caught: unknown) => {
      if (caught instanceof ApiError) {
        setError(caught);
        notify(caught.message, 'recover');
        return;
      }
      notify('Enregistrement impossible.', 'recover');
    },
  });

  function set<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]): void {
    if (values === null) return;
    onChange({ ...values, [key]: value });
  }

  return (
    <Sheet
      open={values !== null}
      onClose={() => {
        setError(null);
        setMissing(null);
        onDone();
      }}
      title={editing ? 'Modifier la séance' : 'Planifier une séance'}
      lede={
        swimming
          ? 'Le programme s’écrit une ligne par bloc, dans la notation.'
          : running
            ? 'La séance s’écrit en blocs : la durée et la distance en viennent.'
            : undefined
      }
    >
      {values !== null && (
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const { kind } = values;
            if (kind === null) {
              setMissing('Choisis la nature de la séance.');
              return;
            }
            setMissing(null);
            save.mutate(bodyOf({ ...values, kind }));
          }}
        >
          <div className={styles.kinds}>
            <ChipStrip label="Nature de la séance">
              {KIND_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  selected={values.kind === option.value}
                  onClick={() => {
                    set('kind', option.value);
                  }}
                >
                  {option.label}
                </Chip>
              ))}
            </ChipStrip>
          </div>

          <Field
            label="Date"
            type="date"
            value={values.date}
            error={error?.messageFor('date')}
            onChange={(event) => {
              set('date', event.target.value);
            }}
          />

          <Field
            label="Heure"
            type="time"
            value={values.time ?? ''}
            hint="Facultative — sans heure, la séance tient la journée entière."
            error={error?.messageFor('time')}
            onChange={(event) => {
              set('time', event.target.value || null);
            }}
          />

          <Field
            label="Titre"
            value={values.title}
            placeholder={swimming ? 'Endurance' : running ? 'Lignes droites' : 'Haut du corps'}
            error={error?.messageFor('title')}
            onChange={(event) => {
              set('title', event.target.value);
            }}
          />

          {running && (
            <RunProgramField
              value={values.program ?? ''}
              error={error?.messageFor('program')}
              onChange={(program) => {
                set('program', program);
              }}
            />
          )}

          <Stepper
            label="Durée (min)"
            value={values.duration_min}
            step={5}
            min={5}
            max={300}
            placeholder={running ? 'déduite' : '—'}
            error={error?.messageFor('duration_min')}
            onChange={(value) => {
              set('duration_min', value);
            }}
          />

          {running && (
            <>
              <p className={own.label}>Ce que tu vises — facultatif</p>
              <div className={own.goals}>
                <Field
                  label="Distance (km)"
                  inputMode="decimal"
                  value={values.distance_km ?? ''}
                  placeholder="10"
                  error={error?.messageFor('distance_km')}
                  onChange={(event) => {
                    set('distance_km', event.target.value);
                  }}
                />
                <Field
                  label="Chrono"
                  value={values.goal_time ?? ''}
                  placeholder="50'00"
                  error={error?.messageFor('goal_time')}
                  onChange={(event) => {
                    set('goal_time', event.target.value);
                  }}
                />
              </div>
              <Stepper
                label="Effort perçu visé (1–10)"
                value={
                  values.rpe_goal === null || values.rpe_goal === undefined
                    ? ''
                    : String(values.rpe_goal)
                }
                step={1}
                min={1}
                max={10}
                placeholder="—"
                error={error?.messageFor('rpe_goal')}
                onChange={(value) => {
                  set('rpe_goal', value === '' ? null : Number(value));
                }}
              />
            </>
          )}

          {swimming && (
            <ProgramField
              value={values.program ?? ''}
              hint="Vide : une piscine libre, sans programme."
              error={error?.messageFor('program')}
              onChange={(program) => {
                set('program', program);
              }}
            />
          )}

          <Field
            label="Note"
            value={values.note ?? ''}
            placeholder={swimming ? 'bassin de 25 m, lignes 4' : '5×5, montée en charge'}
            onChange={(event) => {
              set('note', event.target.value);
            }}
          />

          {missing !== null && (
            <p className={own.error} role="alert">
              {missing}
            </p>
          )}

          <Button type="submit" variant="primary" busy={save.isPending} className={styles.submit}>
            {editing ? 'Enregistrer' : 'Planifier'}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
