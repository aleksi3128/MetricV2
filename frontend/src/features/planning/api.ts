/**
 * Planning sport (`PLAN-01` → `PLAN-06`).
 *
 * Aucun calcul ici, comme partout ailleurs : le mois arrive **découpé en semaines
 * complètes**, débordements compris, et le taux de respect arrive calculé. Recomposer la
 * grille côté client reviendrait à réécrire « la semaine commence le lundi », qui n'a
 * qu'une implémentation dans ce projet (`app/core/dates.py`).
 *
 * Deux appels ne se rejoignent jamais : `propose` rend des séances que personne n'a
 * validées, `adopt` écrit celles qu'on a gardées. Un écran qui enchaînerait les deux tout
 * seul romprait `PLAN-04`.
 */

import { request } from '@/lib/api';

export type PlanKind = 'course' | 'muscu' | 'natation' | 'autre';

/** Une part de la distance d'un programme — par nage, ou par allure. */
export interface SwimShare {
  code: string;
  label: string;
  distance_m: number;
}

/** Une ligne d'un programme, **réécrite par le serveur** : `×`, `'`, sigles du glossaire. */
export interface SwimProgramLine {
  number: number;
  kind: 'section' | 'block';
  text: string;
  distance_m: number;
}

export interface SwimError {
  line: number;
  token: string | null;
  message: string;
}

/**
 * Un programme de nage **lu par le serveur** (`docs/planning-natation.md` §2.3).
 *
 * L'écran n'en lit aucun lui-même : reconnaître un sigle, dérouler `8×50`, additionner les
 * mètres sont la règle du format, et elle n'a qu'une implémentation. Les totaux sont `null`
 * sur un programme fautif — un total calculé sur les seules lignes lisibles serait faux.
 */
export interface SwimProgram {
  lines: SwimProgramLine[];
  errors: SwimError[];
  total_m: number | null;
  by_stroke: SwimShare[];
  by_pace: SwimShare[];
  rest_s: number | null;
}

/**
 * Une séance de course **lue par le serveur** (`docs/planifier-une-seance.md`, D2) : les
 * blocs réécrits avec leur cible, les totaux — ou la faute, sur son morceau.
 */
export interface RunProgramLine {
  depth: number;
  kind: 'block' | 'group' | 'recovery';
  text: string;
}

export interface RunProgram {
  lines: RunProgramLine[];
  errors: { token: string | null; message: string }[];
  /** La forme canonique, celle qui s'enregistre. */
  notation: string;
  distance_m: number | null;
  duration_s: number | null;
  /** « 7,9 km · 52 min », ou ce qui manque pour le dire. */
  summary: string;
}

/** Une ligne de la séance **nagée**, réécrite dans la notation : `4×50 CR R~40`. */
export interface SwimLine {
  text: string;
  distance_m: number;
  laps: number[];
  /** Une longueur douteuse dans ces tours, d'après la montre. Signalé, jamais corrigé. */
  suspect: boolean;
  /** La nage écrite n'est qu'une lecture de la montre, que personne n'a confirmée. */
  detected: boolean;
  /** Un titre de section d'une natation saisie — dit par le serveur, jamais deviné ici. */
  section: boolean;
}

export type SwimCategory = 'stroke' | 'pace' | 'option';

export interface SwimCodeEntry {
  code: string;
  label: string;
  category: SwimCategory;
  /** Livré avec l'application : son libellé se renomme, il ne se supprime jamais. */
  base: boolean;
  default_label: string | null;
  /** La ligne de `swim_codes.csv`, **s'il y en a une** — un sigle de base jamais renommé n'en a pas. */
  id: number | null;
  token: string | null;
  /** Employé par une séance prévue : le serveur en refusera la suppression. */
  used: boolean;
}

export interface SwimCodePayload {
  code: string;
  label: string;
  category: SwimCategory;
}

export interface PlannedSession {
  id: number;
  token: string;
  session_id: string;
  date: string;
  time: string | null;
  kind: PlanKind;
  title: string;
  duration_min: number;
  note: string | null;
  /** `manual` ou `ai` — d'où vient la ligne, pas ce qu'elle vaut. */
  source: string;
  /**
   * L'adresse de séance Cadence **extraite de la note par le serveur**.
   *
   * Le lien vit dans la note et nulle part ailleurs — `plan.csv` ne gagne aucune colonne.
   * Mais reconnaître une adresse Cadence dans du texte libre est une règle du format, et
   * la tenir ici en ferait une seconde implémentation, qui divergerait de celle du serveur
   * au premier cas limite.
   */
  workout_url: string | null;
  /** Le programme tel qu'il a été tapé — ce que le formulaire de correction recharge. */
  program: string | null;
  /** Le programme **lu**, `null` hors natation. */
  swim: SwimProgram | null;
  /** La séance de course **lue**, `null` hors course ou sans notation. */
  run: RunProgram | null;
  /** Ce que vise une course, et sa phrase : « 10 km en 50:00 · effort 7/10 ». */
  distance_km: number | null;
  goal_s: number | null;
  rpe_goal: number | null;
  goal_text: string | null;
  /** La distance nagée ce jour-là, et l'écart au prévu — calculés par le serveur. */
  done_m: number | null;
  gap_m: number | null;
}

export interface DoneActivity {
  kind: 'run' | 'workout' | 'swim';
  id: number;
  label: string;
  duration_min: number;
  /** Pour une natation : la séance réécrite dans la notation, et ses tours douteux. */
  swim_id: string | null;
  distance_m: number | null;
  lines: SwimLine[];
  suspect_laps: number;
}

export interface DayCell {
  date: string;
  in_month: boolean;
  planned: PlannedSession[];
  done: DoneActivity[];
}

export interface MonthView {
  month: string;
  start: string;
  end: string;
  days: DayCell[];
  /** Aujourd'hui **selon le serveur** : le fuseau de découpage est son réglage. */
  today: string;
}

export interface WeekAdherence {
  week: string;
  planned: number;
  done: number;
  honoured: number;
  /** `null` quand rien n'était prévu — jamais `0`. */
  rate: number | null;
}

export interface AdherenceView {
  weeks: WeekAdherence[];
  rate: number | null;
  planned: number;
  honoured: number;
}

export interface ProposedSession {
  date: string;
  time: string | null;
  kind: PlanKind;
  title: string;
  duration_min: number;
  note: string | null;
  program: string | null;
  swim: SwimProgram | null;
  reason: string | null;
}

export interface Proposal {
  sessions: ProposedSession[];
  start: string;
  end: string;
  basis: string[];
  dropped: string[];
}

export interface SubscriptionInfo {
  configured: boolean;
  url: string | null;
  message: string;
}

/** Ce qui part vers le serveur pour créer ou corriger une séance. */
export interface PlanFormValues {
  date: string;
  time: string | null;
  /** `null` à l'ouverture : aucune nature n'est choisie à la place de l'utilisateur. */
  kind: PlanKind | null;
  title: string;
  /** Vide pour une course en notation : le serveur la déduit des blocs. */
  duration_min: string;
  note?: string | null;
  /** Le programme d'une natation, ou la séance d'une course, dans leur notation. */
  program?: string | null;
  /** Ce que vise une course (D7) : distance, chrono (`50'00`), effort perçu. */
  distance_km?: string | null;
  goal_time?: string | null;
  rpe_goal?: number | null;
  /** Le circuit Cadence choisi pour une muscu (D12). */
  circuit_id?: string | null;
}

/** Ce qu'il faut savoir avant de planifier (D9) : des avis, jamais un refus. */
export interface PlanCheck {
  warnings: { key: string; text: string }[];
  free_slot: string | null;
  free_text: string | null;
}

export interface CheckBody {
  date: string;
  time: string | null;
  kind: PlanKind;
  duration_min: number | null;
  program: string | null;
  session_id: string | null;
}

/** Une séance-type, écrite en notation depuis le catalogue du coach (D5). */
export interface RunTemplate {
  type: string;
  title: string;
  notation: string;
  duration_min: number;
}

/** La séance du coach pour un jour, en notation (D6). */
export interface CoachSession {
  title: string;
  notation: string;
  duration_min: number;
}

/** Ce qui part au serveur : la nature choisie, les nombres en nombres, le vide en `null`. */
export interface PlanBody {
  date: string;
  time: string | null;
  kind: PlanKind;
  title: string;
  duration_min: number | null;
  note?: string | null;
  program?: string | null;
  distance_km?: number | null;
  goal_time?: string | null;
  rpe_goal?: number | null;
  /** Le circuit Cadence choisi : le serveur pose son lien dans la note (D12). */
  circuit_id?: string | null;
}

/** Garde anti-conflit : le jeton lu est celui qu'on renvoie (`STO-05`). */
function ifMatch(token: string): Record<string, string> {
  return { 'If-Match': token };
}

/** Ce que le coach a changé au planning (`docs/agenda-replanification.md`). */
export interface PlanChange {
  key: string;
  action: 'move' | 'lighten' | 'rest' | 'drop';
  /** « Seuil — mar. 20/10 → jeu. 22/10 », rédigé par le serveur. */
  summary: string;
  reason: string;
  date: string;
  status: 'pending' | 'accepted' | 'refused';
}

/** L'agenda lu — jamais son lien, qui est un secret. */
export interface AgendaView {
  configured: boolean;
  hint: string | null;
  events: number;
  unsupported: number;
  error: string | null;
}

export const planningApi = {
  agenda: () => request<AgendaView>('/api/planning/agenda'),
  setAgenda: (url: string) =>
    request<AgendaView>('/api/planning/agenda', { method: 'PATCH', body: { url } }),
  changes: () => request<PlanChange[]>('/api/planning/changes'),
  decideChange: (key: string, accept: boolean) =>
    request<PlanChange[]>(`/api/planning/changes/${encodeURIComponent(key)}`, {
      method: 'POST',
      body: { accept },
    }),
  replan: () => request<PlanChange[]>('/api/planning/replan', { method: 'POST' }),
  month: (month: string) => request<MonthView>('/api/planning/month', { query: { month } }),

  adherence: (weeks = 8) => request<AdherenceView>('/api/planning/adherence', { query: { weeks } }),

  create: (values: PlanBody) =>
    request<PlannedSession>('/api/planning/sessions', { method: 'POST', body: values }),

  update: (id: number, token: string, values: PlanBody) =>
    request<PlannedSession>(`/api/planning/sessions/${String(id)}`, {
      method: 'PATCH',
      body: values,
      headers: ifMatch(token),
    }),

  remove: (id: number, token: string) =>
    request<undefined>(`/api/planning/sessions/${String(id)}`, {
      method: 'DELETE',
      headers: ifMatch(token),
    }),

  propose: (body: { weeks: 1 | 2; constraints: string; objective: string }) =>
    request<Proposal>('/api/planning/proposal', { method: 'POST', body }),

  /** Écrit **ce qui reste** après retrait individuel, en une fois (`PLAN-04`). */
  adopt: (sessions: PlanFormValues[]) =>
    request<{ created: PlannedSession[] }>('/api/planning/proposal/adopt', {
      method: 'POST',
      body: { sessions },
    }),

  subscription: () => request<SubscriptionInfo>('/api/planning/subscription'),

  /** Lit un programme **sans rien écrire** — l'aperçu du formulaire. */
  parseSwim: (program: string) =>
    request<SwimProgram>('/api/planning/swim/parse', { method: 'POST', body: { program } }),
  runTemplates: (durationMin: number | null) =>
    request<RunTemplate[]>('/api/planning/run/templates', {
      query: durationMin === null ? {} : { duration_min: String(durationMin) },
    }),
  runCoach: (day: string) =>
    request<CoachSession | null>('/api/planning/run/coach', { query: { date: day } }),
  check: (body: CheckBody) => request<PlanCheck>('/api/planning/check', { method: 'POST', body }),
  parseRun: (program: string) =>
    request<RunProgram>('/api/planning/run/parse', { method: 'POST', body: { program } }),

  swimCodes: () => request<{ codes: SwimCodeEntry[] }>('/api/planning/swim/codes'),

  /** Ajoute un sigle, ou renomme pour la première fois un sigle de base. */
  addSwimCode: (payload: SwimCodePayload) =>
    request<{ codes: SwimCodeEntry[] }>('/api/planning/swim/codes', {
      method: 'POST',
      body: payload,
    }),

  updateSwimCode: (id: number, token: string, payload: SwimCodePayload) =>
    request<{ codes: SwimCodeEntry[] }>(`/api/planning/swim/codes/${String(id)}`, {
      method: 'PATCH',
      body: payload,
      headers: ifMatch(token),
    }),

  /** Retire un sigle ajouté, ou rend son libellé livré à un sigle de base. */
  removeSwimCode: (id: number, token: string) =>
    request<{ codes: SwimCodeEntry[] }>(`/api/planning/swim/codes/${String(id)}`, {
      method: 'DELETE',
      headers: ifMatch(token),
    }),
};
