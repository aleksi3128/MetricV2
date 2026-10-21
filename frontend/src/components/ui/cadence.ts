/**
 * La cadence à la saisie : ses formes, son brouillon, sa forme sérialisée.
 *
 * À part de `CadencePicker.tsx` pour que ce module-là n'exporte qu'un composant (le
 * rafraîchissement à chaud de React l'exige). Aucune règle de cadence ici : le serveur
 * relit, valide et formule (`HEAT-30`).
 */

/** Formes de cadence proposées à la saisie. Le serveur reste seul juge de leur validité. */
export const CADENCE_KINDS = [
  { value: 'daily', label: 'Tous les jours' },
  { value: 'per_week', label: 'N fois par semaine' },
  { value: 'window', label: 'N fois par fenêtre glissante' },
  { value: 'conditional', label: 'Les jours d’entraînement' },
  { value: 'none', label: 'Sans attente (descriptive)' },
] as const;

export type CadenceKind = (typeof CADENCE_KINDS)[number]['value'];

/** Le brouillon d'une cadence. Des chaînes : un champ passe par « 1 » avant « 12 ». */
export interface CadenceDraft {
  kind: CadenceKind;
  count: string;
  windowDays: string;
}

/** La cadence telle que le serveur la rend, décomposée. */
export function cadenceDraft(type: string, params: Record<string, string | number>): CadenceDraft {
  return {
    kind: CADENCE_KINDS.find((item) => item.value === type)?.value ?? 'daily',
    count: String(params.count ?? params.min_count ?? 1),
    windowDays: String(params.window_days ?? 2),
  };
}

/** La forme sérialisée attendue par l'API. */
export function serializeCadence(draft: CadenceDraft): string {
  switch (draft.kind) {
    case 'per_week':
      return `per_week:count=${draft.count || '1'}`;
    case 'window':
      return `window:min_count=${draft.count || '1'};window_days=${draft.windowDays || '2'}`;
    case 'conditional':
      return 'conditional:trigger=workout';
    case 'none':
      return 'none';
    default:
      return 'daily';
  }
}
