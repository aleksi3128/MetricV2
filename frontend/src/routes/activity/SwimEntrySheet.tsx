/**
 * Enregistrer une natation (`docs/natation-activite.md` §4).
 *
 * Deux chemins, dans l'ordre où ils se présentent au bord du bassin : le fichier de la
 * montre d'abord — il porte les tours, la fréquence cardiaque, tout ce qu'une saisie ne
 * dira jamais —, puis la saisie **dans la notation**, pour une séance nagée sans montre.
 *
 * ## Ce que la saisie ne demande pas
 *
 * **La distance.** Elle est le total du programme, lu par le serveur : la demander en plus
 * ouvrirait la porte à deux chiffres qui ne s'accordent pas. L'aperçu du champ la montre
 * avant l'envoi, et c'est le serveur qui l'écrit.
 *
 * Corriger une natation saisie passe par la même feuille, rouverte sur ses valeurs ; une
 * importée ne s'y corrige pas — sa distance est une mesure, elle se corrige au tour.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Field, Rule, Segmented, Sheet } from '@/components/ui';
import { activityApi, type SwimDetail, type SwimPayload } from '@/features/activity/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { meters } from '@/lib/format';
import { useToast } from '@/lib/toast';

import styles from '../Activity.module.css';
import wide from './EntrySheet.module.css';
import { ProgramField } from '../planning/ProgramField';
import { useInvalidateActivity } from './shared';

const POOLS = [
  { value: '25', label: 'Bassin de 25 m' },
  { value: '50', label: 'Bassin de 50 m' },
] as const;

function blank(today: string): SwimPayload {
  // La durée part **vide** : un nombre pré-rempli serait une séance que personne n'a nagée.
  // Le bassin part de 25 m — ce n'est pas une mesure, c'est le lieu le plus fréquent, et il
  // ne change rien au total.
  return { date: today, start: null, duration_min: '', program: '', pool_m: 25, note: null };
}

function fromSwim(swim: SwimDetail): SwimPayload {
  return {
    date: swim.date,
    start: swim.start === null ? null : swim.start.slice(0, 5),
    duration_min: String(Math.round(swim.duration_s / 60)),
    // Une importée réécrite part de sa lecture tour par tour (`docs/natation-corriger.md`, D7).
    program: swim.program ?? swim.program_hint ?? '',
    pool_m: swim.pool_m,
    note: swim.note,
  };
}

export function SwimEntrySheet({
  open,
  today,
  editing,
  onClose,
}: {
  open: boolean;
  today: string;
  /** La natation à corriger — saisie, ou importée à réécrire —, ou `null` pour en
   *  enregistrer une. */
  editing: SwimDetail | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidateActivity();
  const { notify } = useToast();
  const [values, setValues] = useState<SwimPayload>(() =>
    editing === null ? blank(today) : fromSwim(editing),
  );
  const [error, setError] = useState<ApiError | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  // Réécrire une importée remplace ses tours : un geste qui détruit, donc deux appuis.
  const rewriting = editing !== null && editing.source !== 'manual';
  const [armed, setArmed] = useState(false);

  function done(swim: SwimDetail, verb: string): void {
    invalidate();
    notify(`Natation ${verb} : ${meters(swim.distance_m)}.`, 'effort');
    onClose();
  }

  const save = useMutation({
    mutationFn: (payload: SwimPayload) =>
      editing === null
        ? activityApi.createSwim(payload)
        : activityApi.updateSwim(editing.id, editing.token, { ...payload, rewrite: rewriting }),
    onSuccess: (swim) => {
      setError(null);
      done(swim, editing === null ? 'enregistrée' : 'corrigée');
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

  const upload = useMutation({
    mutationFn: (file: File) => activityApi.importSwimFit(file),
    onSuccess: (swim) => {
      setRefused(null);
      done(swim, 'importée');
    },
    onError: (caught: unknown) => {
      // Dans la feuille et non en toast : « déjà importée » se lit et se relit.
      setRefused(caught instanceof ApiError ? caught.message : 'Ce fichier n’a pas pu être lu.');
    },
  });

  function set<K extends keyof SwimPayload>(key: K, value: SwimPayload[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <Sheet
      open={open}
      wide
      onClose={onClose}
      title={
        editing === null ? 'Natation' : rewriting ? 'Réécrire la natation' : 'Corriger la natation'
      }
      lede={
        editing === null
          ? 'Le fichier de la montre, ou la séance écrite dans la notation.'
          : rewriting
            ? `Réécrite, la séance perd ses ${String(editing.laps.length)} tours de montre : le détail est remplacé par le programme. Le fichier et l’effort perçu restent.`
            : 'La distance se relit dans le programme.'
      }
    >
      <div className={styles.form}>
        {editing === null && (
          <>
            {refused !== null && (
              <p className={styles.error} role="alert">
                {refused}
              </p>
            )}
            <input
              id="swim-fit"
              type="file"
              accept=".fit,.zip,application/vnd.ant.fit,application/zip"
              className="sr-only"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                setRefused(null);
                if (chosen) upload.mutate(chosen);
                // Remis à zéro : sans cela, réessayer le même fichier après un refus ne
                // déclencherait aucun `change`.
                event.target.value = '';
              }}
            />
            <div className={wide.strip}>
              <label htmlFor="swim-fit" className={styles.drop}>
                {upload.isPending ? 'lecture du fichier…' : 'importer le .fit de la montre'}
              </label>
              <p className={styles.note}>
                Les tours, les nages, la fréquence cardiaque : tout est lu dedans, et le fichier
                conservé.
              </p>
            </div>
            <Rule>Ou à la main</Rule>
          </>
        )}

        <form
          className={cx(styles.form, wide.swim)}
          onSubmit={(event) => {
            event.preventDefault();
            if (rewriting && !armed) {
              setArmed(true);
              return;
            }
            save.mutate(values);
          }}
        >
          <div className={wide.column}>
            <Field
              label="Date"
              type="date"
              value={values.date}
              max={today}
              error={error?.messageFor('date')}
              onChange={(event) => {
                set('date', event.target.value);
              }}
            />
            <Field
              label="Heure"
              type="time"
              value={values.start ?? ''}
              hint="Facultative."
              onChange={(event) => {
                set('start', event.target.value || null);
              }}
            />
            <Field
              label="Durée"
              unit="min"
              inputMode="numeric"
              value={values.duration_min}
              placeholder="45"
              hint="Au chrono, repos compris."
              error={error?.messageFor('duration_min')}
              onChange={(event) => {
                set('duration_min', event.target.value);
              }}
            />
            <Segmented
              label="Bassin"
              options={POOLS}
              value={String(values.pool_m) as '25' | '50'}
              onChange={(pool) => {
                set('pool_m', Number(pool));
              }}
            />
          </div>
          <div className={wide.column}>
            <ProgramField
              value={values.program}
              hint="Une ligne par bloc. La distance en est le total."
              error={error?.messageFor('program')}
              onChange={(program) => {
                set('program', program);
              }}
            />
            <Field
              label="Note"
              value={values.note ?? ''}
              placeholder="lignes 4, eau froide"
              onChange={(event) => {
                set('note', event.target.value || null);
              }}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            busy={save.isPending}
            disabled={values.program.trim() === '' || values.duration_min.trim() === ''}
            className={cx(styles.commit, wide.commit)}
          >
            {editing === null
              ? 'Enregistrer la natation'
              : rewriting
                ? armed
                  ? 'Confirmer : remplacer les tours ?'
                  : 'Remplacer les tours par ce programme'
                : 'Enregistrer'}
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
