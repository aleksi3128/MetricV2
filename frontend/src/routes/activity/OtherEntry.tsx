/**
 * Un vélo ou une marche saisis à la main (M-16, `docs/pages/modifications.md`).
 *
 * Sans montre, ces sorties n'entraient nulle part : la route existait, pas l'écran. Elles
 * existent pour **compter dans la charge**, et c'est l'effort perçu qui les y fait
 * entrer — d'où sa place dans ce formulaire plutôt qu'après, où il s'oublie. Il reste
 * facultatif, et la phrase dessous dit ce que coûte de le laisser vide.
 *
 * **La liste des sports vient du serveur** (`GET /api/activity/others`, `sports`) : une
 * seconde liste écrite ici finirait par proposer un sport que le serveur refuse. Aucun
 * n'est choisi d'office — une pastille cochée d'avance serait un vélo que personne n'a
 * fait.
 *
 * **Puis la douleur** (session 10 b), comme après un `.fit` : la sortie écrite, le
 * formulaire cède la place à `PainCheck`, rattaché par l'`other_id` — l'identifiant
 * stable, que la position de la ligne n'est pas.
 *
 * **Le même formulaire corrige** (session 10 b), comme celui d'une pesée sur `/corps` :
 * `editing` désigne la ligne, relue dans la liste servie avec les sports, et le formulaire
 * s'ouvre pré-rempli de ce qu'elle porte — des valeurs relues, pas proposées. Il envoie sous
 * `If-Match` le jeton de cette lecture-là, celle que le formulaire montre. Une correction
 * ne redemande pas la douleur : elle a été demandée à la saisie.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Chip, ChipStrip, Empty, Field, Skeleton, Stepper } from '@/components/ui';
import {
  activityApi,
  type Other,
  type OtherSport,
  type SportChoice,
} from '@/features/activity/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import { PainCheck } from '../body/PainCheck';
import { EffortScale } from './run/Rate';

import styles from '../Activity.module.css';
import own from './OtherEntry.module.css';
import { useInvalidateActivity } from './shared';

export function OtherEntry({
  today,
  editing,
  onBack,
  onDone,
}: {
  today: string;
  /** La position de la ligne à corriger, telle que l'historique la donne. */
  editing?: number | undefined;
  onBack: () => void;
  onDone: () => void;
}) {
  const { data, isPending, error } = useQuery({
    queryKey: keys.activity.others(),
    queryFn: activityApi.others,
  });

  if (isPending) return <Skeleton className={styles.form} />;
  if (error) {
    return (
      <div className={styles.form}>
        <Empty title="Saisie indisponible">
          {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
        </Empty>
        <Button variant="quiet" onClick={onBack}>
          Retour
        </Button>
      </div>
    );
  }
  const current =
    editing === undefined ? undefined : data.others.find((other) => other.id === editing);
  if (editing !== undefined && current === undefined) {
    return (
      <div className={styles.form}>
        <Empty title="Sortie introuvable">
          Elle a été supprimée ou déplacée depuis l’affichage de l’historique.
        </Empty>
        <Button variant="quiet" onClick={onBack}>
          Retour
        </Button>
      </div>
    );
  }
  return (
    <OtherForm
      // Remonté sur un nouveau jeton : le formulaire repart de la ligne relue.
      key={current?.token ?? 'new'}
      today={today}
      sports={data.sports}
      editing={current}
      onBack={onBack}
      onDone={onDone}
    />
  );
}

/** Un nombre en texte de champ, virgule décimale — vide s'il n'y en a pas, jamais zéro. */
function fieldText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

function OtherForm({
  today,
  sports,
  editing,
  onBack,
  onDone,
}: {
  today: string;
  sports: readonly SportChoice[];
  editing: Other | undefined;
  onBack: () => void;
  onDone: () => void;
}) {
  const invalidate = useInvalidateActivity();
  const { notify } = useToast();
  const [sport, setSport] = useState<OtherSport | null>(editing?.sport ?? null);
  const [day, setDay] = useState(editing?.date ?? today);
  const [minutes, setMinutes] = useState(editing ? fieldText(editing.duration_min) : '');
  const [distance, setDistance] = useState(editing ? fieldText(editing.distance_km) : '');
  const [rpe, setRpe] = useState<number | null>(editing?.rpe ?? null);
  const [error, setError] = useState<ApiError | null>(null);
  /** La sortie écrite : la feuille demande alors la douleur. */
  const [saved, setSaved] = useState<Other | null>(null);

  const save = useMutation({
    mutationFn: (chosen: OtherSport) => {
      const fields = {
        date: day,
        sport: chosen,
        duration_min: minutes,
        distance_km: distance || null,
        rpe,
      };
      return editing
        ? activityApi.updateOther(editing.id, editing.token, fields)
        : activityApi.createOther(fields);
    },
    onSuccess: (other) => {
      invalidate();
      const label = sports.find((item) => item.value === other.sport)?.label ?? other.sport;
      if (editing) {
        notify(`Sortie corrigée : ${label.toLowerCase()}.`, 'effort');
        onDone();
        return;
      }
      notify(`Sortie enregistrée : ${label.toLowerCase()}.`, 'effort');
      setSaved(other);
    },
    onError: (caught: unknown) => {
      // Un conflit ne se force pas : la ligne a changé depuis qu'on l'a lue. La liste se
      // relit et le formulaire remonte sur elle — le message passe donc en toast, qu'un
      // remontage n'emporte pas (le motif de M-17, sur `/plan`).
      if (editing && caught instanceof ApiError && caught.code === 'conflict') {
        notify(caught.message, 'recover');
        invalidate();
        return;
      }
      setError(caught instanceof ApiError ? caught : null);
    },
  });

  if (saved !== null) {
    return (
      <PainCheck date={saved.date} activityId={saved.other_id} today={today} onDone={onDone} />
    );
  }

  return (
    <div className={styles.form}>
      {error !== null && (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )}

      <div className={own.group}>
        <p className={own.legend}>Sport</p>
        <ChipStrip label="Sport">
          {sports.map((item) => (
            <Chip
              key={item.value}
              selected={sport === item.value}
              onClick={() => {
                setSport(item.value);
              }}
            >
              {item.label}
            </Chip>
          ))}
        </ChipStrip>
      </div>

      <div className={styles.pair}>
        <Field
          label="Date"
          type="date"
          value={day}
          max={today}
          error={error?.messageFor('date')}
          onChange={(event) => {
            setDay(event.target.value);
          }}
        />
        <Field
          label="Durée"
          placeholder="1h30 ou 45"
          hint="h:mm, 1h30 ou minutes"
          value={minutes}
          error={error?.messageFor('duration_min')}
          onChange={(event) => {
            setMinutes(event.target.value);
          }}
        />
      </div>

      <Stepper
        label="Distance (km)"
        value={distance}
        onChange={setDistance}
        step={0.5}
        min={0}
        hint="Facultative."
        error={error?.messageFor('distance_km')}
      />

      <div className={cx(own.group, own.scale)}>
        <p className={own.legend}>Effort perçu</p>
        <EffortScale value={rpe} onChange={setRpe} clearable disabled={save.isPending} />
        <p className={own.cost}>
          Facultatif. Sans lui, la sortie est enregistrée mais ne compte pas dans la charge.
        </p>
      </div>

      <div className={styles.sheetCommit}>
        <Button
          variant="primary"
          className={styles.commit}
          busy={save.isPending}
          disabled={sport === null || day === '' || minutes.trim() === ''}
          onClick={() => {
            if (sport !== null) save.mutate(sport);
          }}
        >
          {editing ? 'Corriger la sortie' : 'Enregistrer la sortie'}
        </Button>
        <Button variant="quiet" disabled={save.isPending} onClick={onBack}>
          Retour
        </Button>
      </div>

      {sport === null && <p className={styles.empty}>Choisis d’abord le sport.</p>}
    </div>
  );
}
