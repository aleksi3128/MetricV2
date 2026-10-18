/** Ce que l'écran écrit d'un programme de nage lu — de la mise en forme, aucun calcul. */

import type { SwimProgram } from '@/features/planning/api';
import { meters, swimClock } from '@/lib/format';

/** La ligne de totaux : `1 400 m · CR 1 200 · DOS 200 · repos 2'40`. */
export function swimSummary(program: SwimProgram): string | null {
  if (program.total_m === null) return null;
  const parts = [meters(program.total_m)];
  for (const share of program.by_stroke) parts.push(`${share.code} ${String(share.distance_m)}`);
  if (program.rest_s !== null) parts.push(`repos ${swimClock(program.rest_s)}`);
  return parts.join(' · ');
}
