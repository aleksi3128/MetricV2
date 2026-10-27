/**
 * L'effort perçu d'une sortie, de 1 à 10 (`docs/coach-course.md`, **C10**).
 *
 * Un seul composant pour les trois endroits qui le demandent — la fin de l'import, la
 * page de la sortie, le bilan du matin — sans quoi trois échelles finiraient par ne plus
 * dire la même chose. Une note est une **correction de la ligne** : elle passe sous
 * `If-Match`, avec le jeton de la course telle qu'on l'a lue.
 */

import { useMutation } from '@tanstack/react-query';

import { Chip } from '@/components/ui';
import { activityApi, type Run } from '@/features/activity/api';
import { ApiError } from '@/lib/api';

import { useInvalidateActivity } from '../shared';
import styles from './Run.module.css';

/** Les repères de l'échelle, tels qu'on les dit — pas une valeur calculée. */
const WORDS: Record<number, string> = {
  1: 'très facile',
  2: 'très facile',
  3: 'facile',
  4: 'facile',
  5: 'modéré',
  6: 'modéré',
  7: 'dur',
  8: 'dur',
  9: 'très dur',
  10: 'à fond',
};

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function rpeWord(rpe: number): string {
  return WORDS[rpe] ?? '';
}

export function RateRun({ run, onRated }: { run: Run; onRated?: (run: Run) => void }) {
  return (
    <RateEffort
      current={run.rpe}
      rate={(rpe) => activityApi.setRunRpe(run.id, run.token, rpe)}
      onRated={onRated}
    />
  );
}

/**
 * La même échelle pour tout ce qui se note — une course, une nage, une sortie à vélo
 * (`docs/charge-multisport.md`) : trois échelles finiraient par ne plus dire la même chose.
 * L'appelant dit **quoi** écrire ; ce composant dit comment le demander.
 */
export function RateEffort<T>({
  current,
  rate: write,
  onRated,
}: {
  current: number | null;
  rate: (rpe: number) => Promise<T>;
  onRated?: ((saved: T) => void) | undefined;
}) {
  const invalidate = useInvalidateActivity();
  const rate = useMutation({
    mutationFn: write,
    onSuccess: (updated) => {
      invalidate();
      onRated?.(updated);
    },
  });
  // Après un échec, l'échelle revient à la note enregistrée : afficher celle qu'on a
  // tentée laisserait croire qu'elle l'est.
  const shown = rate.isError ? current : (rate.variables ?? current);

  return (
    <div className={styles.rate}>
      <EffortScale
        value={shown}
        disabled={rate.isPending}
        onChange={(value) => {
          if (value !== null) rate.mutate(value);
        }}
      />
      {rate.error !== null && (
        <p className={styles.rateError} role="alert">
          {rate.error instanceof ApiError ? rate.error.message : 'La note n’a pas été enregistrée.'}
        </p>
      )}
    </div>
  );
}

/**
 * L'échelle seule, sans écriture : ce que montre `RateEffort`, pour un formulaire qui
 * enregistre l'effort **avec** le reste — la saisie d'une sortie à la main (M-16). Une
 * seconde échelle aurait fini par dire autre chose que la première.
 *
 * Un second appui sur la note choisie la retire : l'effort y est facultatif, et sans
 * cela, un appui de trop ne se défaisait qu'en fermant le formulaire.
 */
export function EffortScale({
  value,
  onChange,
  clearable = false,
  disabled = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  clearable?: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      <div className={styles.rateGrid} role="group" aria-label="Effort perçu, de 1 à 10">
        {SCALE.map((item) => (
          <Chip
            key={item}
            selected={value === item}
            disabled={disabled}
            onClick={() => {
              onChange(clearable && value === item ? null : item);
            }}
          >
            {item}
          </Chip>
        ))}
      </div>
      <p className={styles.rateWord} aria-live="polite">
        {value == null ? '1 très facile · 10 à fond' : `${String(value)} · ${rpeWord(value)}`}
      </p>
    </>
  );
}
