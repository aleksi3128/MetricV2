/** Ce que partagent les sections de `/corps` : pesées, matins, mensurations, douleurs. */

import { useQueryClient } from '@tanstack/react-query';

import type { Tone } from '@/components/ui';
import type { MorningEntry } from '@/features/body/api';
import type { PainStatus } from '@/features/pain/api';
import { hoursMinutes } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';

/**
 * « FC 52 bpm · VFC 61 ms · sommeil 7 h 12 » : les seules mesures qu'un matin porte, et
 * seulement celles qu'il porte. La liste de `/corps` et le rappel du parcours la partagent.
 */
export function morningMeasures(entry: MorningEntry): string {
  return (
    [
      entry.resting_hr === null ? null : `FC ${String(entry.resting_hr)} bpm`,
      entry.hrv_ms === null ? null : `VFC ${String(entry.hrv_ms)} ms`,
      entry.sleep_min === null ? null : `sommeil ${hoursMinutes(entry.sleep_min)}`,
    ]
      .filter((part) => part !== null)
      // Insécables dans une mesure : « sommeil » en fin de ligne et « 7 h 12 » sous elle
      // se lisaient comme deux choses (vu à 402 px). La ligne se coupe entre les mesures.
      .map((part) => part.replaceAll(' ', '\u00a0'))
      .join(' · ')
  );
}

/** L'état d'un épisode, servi ; l'écran n'en choisit que le mot et le ton. */
export const STATUS: Record<PainStatus, { label: string; tone: Tone }> = {
  stop: { label: 'arrêt', tone: 'recover' },
  adapt: { label: 'séance adaptée', tone: 'load' },
  closed: { label: 'refermée', tone: 'effort' },
};

/** Écrire une douleur change le coach et le parcours du matin : les trois se relisent. */
export function useInvalidatePain() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.body.pain() });
    void client.invalidateQueries({ queryKey: keys.coach.all() });
    void client.invalidateQueries({ queryKey: keys.morning.all() });
    for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
  };
}

/** Une pesée ou une mensuration nourrit le tableau de bord et la piste d'assiduité. */
export function useInvalidateBody() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.body.all() });
    for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
  };
}

/**
 * Un matin corrigé change la forme du jour : le coach, le parcours du matin et la page
 * d'une course (« Le matin ») la relisent — les mêmes clés que le parcours après sa saisie.
 */
export function useInvalidateMorning() {
  const client = useQueryClient();
  return () => {
    for (const key of [
      keys.body.all(),
      keys.activity.all(),
      keys.coach.all(),
      keys.morning.all(),
      ...CROSS_CUTTING,
    ]) {
      void client.invalidateQueries({ queryKey: key });
    }
  };
}
