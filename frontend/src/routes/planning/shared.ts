/** Ce que les sections de `/planning` se partagent : libellés, mois, invalidation. */

import { useQueryClient } from '@tanstack/react-query';

import type {
  PlanFormValues,
  PlanKind,
  PlannedSession,
  ProposedSession,
} from '@/features/planning/api';
import { hoursMinutes } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';

export const KIND_LABELS: Record<PlanKind, string> = {
  natation: 'Natation',
  course: 'Course',
  muscu: 'Muscu',
  autre: 'Autre',
};

/** La natation en tête : c'est la nature que l'écran est venu porter. */
export const KIND_OPTIONS: { value: PlanKind; label: string }[] = [
  { value: 'natation', label: 'Natation' },
  { value: 'muscu', label: 'Muscu' },
  { value: 'course', label: 'Course' },
  { value: 'autre', label: 'Autre' },
];

export const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const WEEKDAY_NAMES = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
];

/**
 * Le formulaire vierge : **rien d'imposé** (`docs/planifier-une-seance.md`, D8). Il partait
 * de « natation, 60 minutes » — une nature et une durée que personne n'avait décidées. La
 * date vient du jour touché ; la nature et la durée se choisissent.
 */
export const EMPTY_FORM: PlanFormValues = {
  date: '',
  time: null,
  kind: null,
  title: '',
  duration_min: '',
  note: '',
  program: '',
  distance_km: '',
  goal_time: '',
  rpe_goal: null,
};

/** « 50:00 » — le chrono visé tel que le formulaire le recharge, et que le serveur relit. */
function clockOf(seconds: number | null): string {
  if (seconds === null) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const tail = String(secs).padStart(2, '0');
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${tail}`
    : `${String(minutes)}:${tail}`;
}

/**
 * Mois affiché, `AAAA-MM`, décalé de `offset` mois.
 *
 * Le seul calcul de date que l'écran s'autorise, et il ne porte sur aucune donnée : il
 * choisit quelle page demander au serveur. Construit sur des nombres et non sur un `Date`
 * pour éviter qu'un 31 mai « + 1 mois » atterrisse en juillet.
 */
export function shiftMonth(month: string, offset: number): string {
  const [year, index] = month.split('-').map(Number);
  const total = (year ?? 0) * 12 + (index ?? 1) - 1 + offset;
  return `${String(Math.floor(total / 12))}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

export function sessionLine(session: PlannedSession | ProposedSession): string {
  const clock = session.time ?? 'sans heure';
  return `${clock} · ${KIND_LABELS[session.kind]} · ${hoursMinutes(session.duration_min)}`;
}

/** Ce qu'une séance prévue devient dans le formulaire de correction — la note **entière**. */
export function formOf(session: PlannedSession): Partial<PlanFormValues> {
  return {
    date: session.date,
    time: session.time,
    kind: session.kind,
    title: session.title,
    duration_min: String(session.duration_min),
    note: session.note ?? '',
    program: session.program ?? '',
    distance_km: session.distance_km === null ? '' : String(session.distance_km),
    goal_time: clockOf(session.goal_s),
    rpe_goal: session.rpe_goal,
  };
}

/** Toute écriture invalide le planning **et** les vues transverses — sinon le tableau de
 *  bord ment jusqu'à la prochaine navigation. */
export function useInvalidatePlanning(): () => void {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.planning.all() });
    for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
  };
}
