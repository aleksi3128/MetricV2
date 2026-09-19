/**
 * L'analyse d'une sortie importée (`docs/analyse-course.md`).
 *
 * Partagée entre les tuiles de la page Course et ses sections : **même clé, une seule
 * lecture** du `.fit` rangé. La requête n'est posée que si la course porte un fichier —
 * `fit_path` n'est lu que comme drapeau, jamais construit en adresse.
 */

import { useQuery } from '@tanstack/react-query';

import { activityApi, type Run } from '@/features/activity/api';
import { keys } from '@/lib/query';

export function useRunAnalysis(run: Run) {
  return useQuery({
    queryKey: keys.activity.runAnalysis(run.id),
    queryFn: () => activityApi.runAnalysis(run.id),
    enabled: run.fit_path !== '',
  });
}
