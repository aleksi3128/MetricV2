/**
 * Planifier ou corriger une séance (`PLAN-02`), dans une feuille.
 *
 * Elle était une carte posée sous le panneau du jour. Avec un programme de nage à écrire,
 * elle repoussait la grille hors de l'écran — or c'est en regardant la semaine qu'on
 * décide quoi y mettre. La feuille garde la page en place dessous.
 *
 * ## Le programme
 *
 * Une ligne par bloc, dans la notation (`docs/planning-natation.md` §2). **L'écran ne la
 * lit pas** : il envoie le texte au serveur, qui rend les lignes réécrites et le total, ou
 * la ligne fautive. L'aperçu arrive 400 ms après la dernière frappe — assez tard pour ne
 * pas interroger le serveur à chaque lettre, assez tôt pour voir sa faute avant d'envoyer.
 *
 * Le clavier du téléphone est l'adversaire : il n'a pas de `×`, change `'` en `’`, met une
 * majuscule en tête et « corrige » `PB` en `Pb`. Le serveur tolère les deux premiers ; le
 * champ coupe les deux autres, et une rangée de puces insère au curseur ce que le pouce
 * tape mal.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Chip, ChipStrip, Field, Sheet, Stepper } from '@/components/ui';
import { planningApi, type PlanFormValues, type PlannedSession } from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';

import styles from '../Planning.module.css';
import { ProgramField } from './ProgramField';
import { KIND_OPTIONS, useInvalidatePlanning } from './shared';

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

  const swimming = values?.kind === 'natation';

  const save = useMutation({
    mutationFn: (payload: PlanFormValues) =>
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
        onDone();
      }}
      title={editing ? 'Modifier la séance' : 'Planifier une séance'}
      lede={swimming ? 'Le programme s’écrit une ligne par bloc, dans la notation.' : undefined}
    >
      {values !== null && (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            // Un programme ne part qu'avec une natation : changer de nature en cours de
            // saisie ne doit pas faire refuser la séance pour un champ qu'on ne voit plus.
            save.mutate({ ...values, program: swimming ? (values.program ?? null) : null });
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
            placeholder={swimming ? 'Endurance' : 'Haut du corps'}
            error={error?.messageFor('title')}
            onChange={(event) => {
              set('title', event.target.value);
            }}
          />

          <Stepper
            label="Durée (min)"
            value={values.duration_min}
            step={15}
            min={5}
            max={300}
            error={error?.messageFor('duration_min')}
            onChange={(value) => {
              set('duration_min', value);
            }}
          />

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

          <Button type="submit" variant="primary" busy={save.isPending} className={styles.submit}>
            {editing ? 'Enregistrer' : 'Planifier'}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
