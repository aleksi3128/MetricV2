/** Ce que partagent les écrans des douleurs (`docs/douleurs.md`). */

import { useQueryClient } from '@tanstack/react-query';

import { CROSS_CUTTING, keys } from '@/lib/query';

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
