/**
 * Le relevé d'une douleur (`docs/douleurs.md`).
 *
 * Un seul composant pour les trois endroits qui le demandent — la fin d'un import, le
 * parcours du matin, `/corps` — comme `RateRun` pour l'effort perçu : trois formulaires
 * finiraient par ne plus poser la même question.
 *
 * **Aucun choix n'est pré-sélectionné.** Le côté, l'intensité, le moment, le type : chacun
 * se donne, parce qu'une pastille allumée d'avance se valide sans être lue, et le fichier
 * de mesures recevrait une valeur que personne n'a dite. La base connue d'une zone est
 * **rappelée en phrase**, comme la dernière pesée au parcours du matin — jamais posée dans
 * le champ.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { SyntheticEvent } from 'react';

import { Button, Chip, Field } from '@/components/ui';
import {
  painApi,
  type PainEpisode,
  type PainKind,
  type PainMoment,
  type PainSide,
  type PainSource,
} from '@/features/pain/api';
import { ApiError } from '@/lib/api';

import styles from './Pain.module.css';
import { useInvalidatePain } from './shared';

const SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const SIDES: readonly { value: PainSide; label: string }[] = [
  { value: 'left', label: 'Gauche' },
  { value: 'right', label: 'Droite' },
  { value: 'both', label: 'Les deux' },
  { value: 'na', label: 'Sans objet' },
];

const MOMENTS: readonly { value: PainMoment; label: string }[] = [
  { value: 'during', label: 'Pendant' },
  { value: 'after', label: 'Après' },
  { value: 'next_day', label: 'Le lendemain' },
  { value: 'rest', label: 'Au repos' },
];

const KINDS: readonly { value: PainKind; label: string }[] = [
  { value: 'dull', label: 'Sourde' },
  { value: 'sharp', label: 'Vive' },
  { value: 'pulling', label: 'Tiraillement' },
  { value: 'burning', label: 'Brûlure' },
  { value: 'stiff', label: 'Raideur' },
  { value: 'other', label: 'Autre' },
];

function Scale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div className={styles.scale} role="group" aria-label={label}>
      {SCALE.map((item) => (
        <Chip
          key={item}
          selected={value === item}
          onClick={() => {
            onChange(item);
          }}
        >
          {item}
        </Chip>
      ))}
    </div>
  );
}

function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.choices} role="group" aria-label={label}>
      {options.map((option) => (
        <Chip
          key={option.value}
          selected={value === option.value}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );
}

export function PainForm({
  today,
  source,
  episode,
  runId,
  zones = [],
  baselines = {},
  dated = false,
  onDone,
}: {
  /** Le jour du serveur — jamais l'horloge du téléphone. */
  today: string;
  source: PainSource;
  /** Présent : un suivi de cet épisode. Absent : une douleur nouvelle. */
  episode?: PainEpisode | undefined;
  runId?: string | undefined;
  zones?: readonly string[] | undefined;
  baselines?: Readonly<Record<string, number>> | undefined;
  /** Le champ de date, pour saisir une douleur passée depuis `/corps`. */
  dated?: boolean | undefined;
  onDone: (episode: PainEpisode) => void;
}) {
  const invalidate = useInvalidatePain();
  const following = episode !== undefined;
  const [day, setDay] = useState<string | null>(null);
  const [zone, setZone] = useState('');
  const [side, setSide] = useState<PainSide | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [moment, setMoment] = useState<PainMoment | null>(null);
  const [kind, setKind] = useState<PainKind | null>(null);
  const [limp, setLimp] = useState(false);
  const [missing, setMissing] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      painApi.create({
        date: day ?? today,
        pain_id: episode?.pain_id ?? null,
        intensity: intensity ?? 0,
        moment: moment ?? 'after',
        kind: kind ?? 'other',
        limp,
        zone: following ? null : zone.trim(),
        side: following ? null : side,
        baseline: following ? null : baseline,
        run_id: runId ?? null,
        source,
      }),
    onSuccess: (saved) => {
      invalidate();
      onDone(saved);
    },
  });

  const known = baselines[zone.trim().toLocaleLowerCase('fr')];

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    // Le serveur refuserait aussi, mais une pastille oubliée se dit ici, à côté d'elle,
    // plutôt que dans un message général après un aller-retour.
    const gaps = [
      !following && !zone.trim() && 'la zone',
      !following && side === null && 'le côté',
      intensity === null && 'l’intensité',
      !following && baseline === null && 'la base',
      moment === null && 'le moment',
      kind === null && 'le type',
    ].filter((gap): gap is string => typeof gap === 'string');
    if (gaps.length > 0) {
      setMissing(`Il manque ${gaps.join(', ')}.`);
      return;
    }
    setMissing(null);
    save.mutate();
  }

  const error = save.error instanceof ApiError ? save.error : null;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {dated && (
        <Field
          label="Date"
          type="date"
          value={day ?? today}
          max={today}
          error={error?.messageFor('date')}
          onChange={(event) => {
            setDay(event.target.value);
          }}
        />
      )}

      {!following && (
        <>
          <Field
            label="Où ?"
            placeholder="Achille, voûte plantaire, genou…"
            value={zone}
            maxLength={60}
            autoComplete="off"
            error={error?.messageFor('zone')}
            onChange={(event) => {
              setZone(event.target.value);
            }}
          />
          {zones.length > 0 && (
            <div className={styles.choices} role="group" aria-label="Zones déjà notées">
              {zones.map((item) => (
                <Chip
                  key={item}
                  selected={zone.trim().toLocaleLowerCase('fr') === item.toLocaleLowerCase('fr')}
                  onClick={() => {
                    setZone(item);
                  }}
                >
                  {item}
                </Chip>
              ))}
            </div>
          )}
          <p className={styles.label}>Côté</p>
          <Choices label="Côté" options={SIDES} value={side} onChange={setSide} />
        </>
      )}

      <p className={styles.label}>{following ? 'Combien aujourd’hui ?' : 'Combien ?'}</p>
      <Scale label="Intensité, de 0 à 10" value={intensity} onChange={setIntensity} />

      {!following && (
        <>
          <p className={styles.label}>Et avant la séance ?</p>
          <Scale label="Base, de 0 à 10" value={baseline} onChange={setBaseline} />
          {known !== undefined && (
            <p className={styles.hint}>Dernière base notée pour cette zone : {known}/10.</p>
          )}
        </>
      )}

      <p className={styles.label}>Quand ?</p>
      <Choices label="Moment" options={MOMENTS} value={moment} onChange={setMoment} />

      <p className={styles.label}>Comment ?</p>
      <Choices label="Type de douleur" options={KINDS} value={kind} onChange={setKind} />

      <div className={styles.choices}>
        <Chip
          selected={limp}
          onClick={() => {
            setLimp((current) => !current);
          }}
        >
          Je boite
        </Chip>
      </div>

      {(missing ?? error?.message) && (
        <p className={styles.error} role="alert">
          {missing ?? error?.message}
        </p>
      )}

      <Button variant="primary" type="submit" busy={save.isPending} className={styles.submit}>
        {following ? 'Noter le suivi' : 'Noter la douleur'}
      </Button>
    </form>
  );
}
