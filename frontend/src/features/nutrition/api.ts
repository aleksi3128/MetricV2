/**
 * Accès à la nutrition (`NUT-01` → `NUT-10`).
 *
 * La création passe par un formulaire multipart : un fichier ne se transporte pas en
 * JSON. Le client n'envoie pas de type de contenu de confiance — c'est la signature du
 * fichier qui décide côté serveur.
 */

import { request } from '@/lib/api';

export interface Meal {
  id: number;
  token: string;
  datetime: string;
  meal_type: string;
  comment: string | null;
  /** Chemin relatif, à passer à `photoPath()`. */
  photo: string | null;
  protein_g: number | null;
  added_sugar_g: number | null;
  calories: number | null;
  source: string;
}

export interface DayTotals {
  protein_g: number;
  protein_target_g: number;
  protein_ratio: number;
  added_sugar_g: number;
  added_sugar_max_g: number;
  over_sugar: boolean;
  calories: number;
  /** Objectif quotidien, réglable dans `/reglages`. */
  calories_target: number;
  /** Rapport à l'objectif, **déjà plafonné à 1** par le serveur. */
  calories_ratio: number;
  calories_known: number;
  meals: number;
}

/** Les trois plages de l'historique. Le serveur les refuse par son contrat. */
export type HistoryRange = 'month' | 'quarter' | 'year';

/**
 * Une cellule de la grille.
 *
 * Le vocabulaire est celui du composant `Heatmap`, que la grille d'assiduité définit —
 * mais la nutrition n'émet que `done` et `off` : elle n'a ni jour manqué ni bonus.
 */
export interface HistoryDay {
  date: string;
  calories: number;
  protein_g: number;
  added_sugar_g: number;
  meals: number;
  /**
   * Repas du jour dont les calories sont renseignées.
   *
   * Zéro avec `meals > 0` est un état à part entière — relevé, non chiffré — et surtout
   * pas une journée à jeun.
   */
  calories_known: number;
  state: 'done' | 'off';
  level: number;
  reason: 'before_track' | 'future' | 'unmeasured' | null;
}

export interface HistoryPoint {
  date: string;
  calories: number;
  /** `null` sur une série hebdomadaire, qui est déjà une moyenne. */
  trend_calories: number | null;
  protein_g: number;
  added_sugar_g: number;
  days: number;
}

export interface HistoryStats {
  target_calories: number;
  days: number;
  logged_days: number;
  measured_days: number;
  /** `null` sans aucun jour chiffré : un zéro se lirait comme une journée à jeun. */
  avg_calories: number | null;
  avg_protein_g: number | null;
  avg_added_sugar_g: number | null;
  on_target_days: number;
  over_sugar_days: number;
}

export interface WeekdayProfile {
  /** 0 = lundi. */
  weekday: number;
  avg_calories: number | null;
  days: number;
  /** Part de la barre, rapportée au jour le plus copieux. Calculée par le serveur. */
  ratio: number;
  over_target: boolean;
}

export interface TypeShare {
  meal_type: string;
  calories: number;
  /** 0 à 1, calculée par le serveur. */
  share: number;
  meals: number;
}

export interface NutritionHistory {
  range: HistoryRange;
  from: string;
  to: string;
  /** Le jour courant vient du serveur : un écran ne date jamais rien lui-même. */
  today: string;
  granularity: 'day' | 'week';
  target_calories: number;
  added_sugar_max_g: number;
  days: HistoryDay[];
  series: HistoryPoint[];
  stats: HistoryStats;
  weekdays: WeekdayProfile[];
  types: TypeShare[];
}

export interface Favorite {
  id: number;
  token: string;
  favorite_id: string;
  name: string;
  protein_g: number | null;
  added_sugar_g: number | null;
  calories: number | null;
}

/** Une entrée du catalogue d'ingrédients (`NUT-12`). */
export interface Ingredient {
  id: number;
  token: string;
  ingredient_id: string;
  name: string;
  calories_100g: number | null;
  protein_100g: number | null;
  added_sugar_100g: number | null;
}

/** Un ingrédient pesé, tel qu'il part au calcul. */
export interface IngredientLine {
  name: string;
  quantity_g: number;
  calories_100g?: number | null;
  protein_100g?: number | null;
  added_sugar_100g?: number | null;
}

export interface ComposedLine {
  name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  added_sugar_g: number;
}

/**
 * Le total d'un plat, **calculé par le serveur** (`NUT-12`).
 *
 * Ce n'est pas une proposition : c'est une multiplication sur des valeurs saisies. Elle
 * ne se marque donc ni en `AiBlock` ni en `proposed` — le vocabulaire de la proposition
 * est réservé à ce qu'un modèle rend.
 */
export interface Composition {
  lines: ComposedLine[];
  calories: number;
  protein_g: number;
  added_sugar_g: number;
  /** Vrai quand aucune ligne ne porte de valeur : il n'y a rien à totaliser. */
  empty: boolean;
}

export interface NutritionView {
  date: string;
  totals: DayTotals;
  meals: Meal[];
  favorites: Favorite[];
  suggested_type: string;
  types: string[];
  ingredients: Ingredient[];
}

/**
 * Un produit lu chez Open Food Facts, depuis son code-barres (`NUT-13`).
 *
 * **Ce n'est pas une proposition.** C'est la lecture d'une base de données, au même titre
 * que le rappel d'un ingrédient du catalogue — qui remplit déjà les champs en clair, sans
 * marque. Le vocabulaire de la proposition reste à ce qu'un modèle rend.
 */
export interface Product {
  barcode: string;
  name: string;
  /** Pour reconnaître le produit. N'est jamais enregistrée. */
  brand: string | null;
  calories_100g: number | null;
  protein_100g: number | null;
  added_sugar_100g: number | null;
  /** Vrai quand **aucune** des trois valeurs n'est connue : il n'y aura rien à totaliser. */
  partial: boolean;
}

export interface MealFormValues {
  meal_type: string;
  comment: string;
  protein_g: string;
  added_sugar_g: string;
  calories: string;
  photo: File | null;
  /** `ai` quand les macros viennent d'une estimation acceptée (`NUT-04`). */
  source: 'manual' | 'ai';
}

/**
 * Ce qu'un modèle **propose** pour une assiette (`NUT-04`).
 *
 * Tout est nullable, et ce n'est pas une facilité de typage : un champ que le modèle n'a
 * pas su estimer reste vide à l'écran. Le remplir d'un zéro le ferait passer pour une
 * mesure.
 */
export interface MealEstimate {
  comment: string | null;
  protein_g: number | null;
  added_sugar_g: number | null;
  calories: number | null;
  /** Faux quand le modèle annonce lui-même ne pas voir de nourriture. */
  readable: boolean;
  /** Vrai quand la réponse ne porte aucun chiffre. */
  empty: boolean;
}

export function photoPath(relative: string): string {
  return `/api/nutrition/photos/${relative}`;
}

function multipart(values: MealFormValues): FormData {
  const form = new FormData();
  form.set('meal_type', values.meal_type);
  if (values.comment.trim()) form.set('comment', values.comment.trim());
  for (const field of ['protein_g', 'added_sugar_g', 'calories'] as const) {
    const raw = values[field].replace(',', '.').trim();
    if (raw) form.set(field, raw);
  }
  if (values.photo) form.set('photo', values.photo);
  form.set('source', values.source);
  return form;
}

export const nutritionApi = {
  day: (limit?: number) =>
    request<NutritionView>('/api/nutrition', limit ? { query: { limit } } : {}),

  /** Grille, courbe et habitudes sur une plage — une seule requête (`NUT-11`). */
  history: (range: HistoryRange) =>
    request<NutritionHistory>('/api/nutrition/history', { query: { range } }),

  create: (values: MealFormValues) =>
    request<Meal>('/api/nutrition', { method: 'POST', form: multipart(values) }),

  /**
   * Le produit derrière un code-barres. **N'écrit rien** (`NUT-13`).
   *
   * Le serveur interroge Open Food Facts et normalise sa réponse : ni l'en-tête
   * d'identité qu'exige ce service, ni le quota de quinze lectures par minute, ni les
   * conversions d'unités ne se traitent depuis un navigateur.
   */
  product: (barcode: string) => request<Product>(`/api/nutrition/products/${barcode}`),

  /** Totalise des ingrédients pesés. **N'écrit rien** (`NUT-12`). */
  compose: (lines: IngredientLine[]) =>
    request<Composition>('/api/nutrition/compose', { method: 'POST', body: { lines } }),

  /**
   * Enregistre un repas composé, et retient ses ingrédients (`NUT-12`).
   *
   * Le total n'est pas envoyé : le serveur le **recalcule**. Le transmettre inviterait à
   * croire qu'il fait foi, alors que ce qui entre dans le fichier vient du serveur.
   */
  createComposed: (payload: { meal_type: string; comment: string; lines: IngredientLine[] }) =>
    request<Meal>('/api/nutrition/composed', { method: 'POST', body: payload }),

  /**
   * Propose des macros depuis une photo, une description, ou les deux. **N'écrit rien**
   * (`NUT-04`).
   *
   * Les deux paramètres sont facultatifs séparément, jamais ensemble : c'est le serveur
   * qui refuse une demande vide, et non ce client — une seconde règle ici divergerait de
   * la sienne au premier cas limite.
   */
  analyze: (photo: File | null, comment: string | null) => {
    const form = new FormData();
    if (photo) form.set('photo', photo);
    if (comment?.trim()) form.set('comment', comment.trim());
    return request<MealEstimate>('/api/nutrition/analyze', { method: 'POST', form });
  },

  /** Même proposition, pour un repas déjà enregistré avec sa photo. */
  analyzeMeal: (id: number) =>
    request<MealEstimate>(`/api/nutrition/${id}/analyze`, { method: 'POST' }),

  update: (
    id: number,
    token: string,
    payload: {
      meal_type: string;
      comment?: string | null;
      protein_g?: number | null;
      added_sugar_g?: number | null;
      calories?: number | null;
      /** À ne passer que si la provenance change réellement (`NUT-04`, `NUT-09`). */
      source?: 'manual' | 'ai';
    },
  ) =>
    request<Meal>(`/api/nutrition/${id}`, {
      method: 'PATCH',
      body: payload,
      headers: { 'If-Match': token },
    }),

  remove: (id: number, token: string) =>
    request<undefined>(`/api/nutrition/${id}`, {
      method: 'DELETE',
      headers: { 'If-Match': token },
    }),

  addFavorite: (payload: {
    name: string;
    protein_g?: number | null;
    added_sugar_g?: number | null;
    calories?: number | null;
  }) => request<Favorite>('/api/nutrition/favorites', { method: 'POST', body: payload }),

  replayFavorite: (favoriteId: string) =>
    request<Meal>(`/api/nutrition/favorites/${favoriteId}/replay`, { method: 'POST' }),

  removeFavorite: (id: number, token: string) =>
    request<undefined>(`/api/nutrition/favorites/${id}`, {
      method: 'DELETE',
      headers: { 'If-Match': token },
    }),
};
