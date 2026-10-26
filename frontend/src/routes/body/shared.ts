/** Ce que partagent les sections de `/corps` : pesées, matins, mensurations, douleurs. */

import { useQueryClient } from '@tanstack/react-query';

import type { Tone } from '@/components/ui';
import type { PainStatus } from '@/features/pain/api';
import { CROSS_CUTTING, keys } from '@/lib/query';

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
