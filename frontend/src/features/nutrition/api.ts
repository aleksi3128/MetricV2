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
  /** `null` sur tout repas d'avant `NUT-16` : non relevé, et surtout pas zéro. */
  saturated_fat_g: number | null;
  fiber_g: number | null;
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
  /**
   * Sommes des graisses saturées et des fibres, **avec leur couverture** (`NUT-16`).
   *
   * La somme seule mentirait : tous les repas d'avant n'en portent pas, et « 0 g de
   * fibres » se lirait comme une mesure. Sans repas qui les porte, l'écran met un tiret.
   */
  saturated_fat_g: number;
  saturated_fat_known: number;
  fiber_g: number;
  fiber_known: number;
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
  /** 1 à 4 sur un jour chiffré, 0 sinon : le quart de la plage où il tombe. */
  level: number;
  reason: 'before_track' | 'future' | 'unmeasured' | null;
}

export interface HistoryPoint {
  date: string;
  calories: number;
  /** `null` sur une série hebdomadaire, qui est déjà une moyenne. */
  trend_calories: number | null;
  protein_g: number;
  /** Moyenne glissante des protéines, même fenêtre que celle des calories. */
  trend_protein_g: number | null;
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
  /** Écart de la moyenne à l'objectif, en kcal par jour — négatif en dessous. */
  gap_to_target: number | null;
  over_sugar_days: number;
}

export interface WeekdayProfile {
  /** 0 = lundi. */
  weekday: number;
  avg_calories: number | null;
  days: number;
  /** Part de la barre, rapportée à l'objectif et plafonnée à 1. Calculée par le serveur. */
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
  /** L'objectif du jour, servi pour la plage : la courbe s'y compare. */
  protein_target_g: number;
  added_sugar_max_g: number;
  /**
   * Les trois seuils de calories qui séparent les quatre teintes de la grille.
   *
   * Vide sous deux jours chiffrés — il n'y a alors pas de distribution à découper. Sans
   * eux, « moins → plus » ne nomme aucune quantité.
   */
  level_bounds: number[];
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
  saturated_fat_g: number | null;
  fiber_g: number | null;
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
  saturated_fat_100g: number | null;
  fiber_100g: number | null;
  /** La portion habituelle, en grammes (`NUT-21`). Sert une puce, jamais un préremplissage. */
  portion_g: number | null;
  barcode: string;
  /** Le jour d'une correction à la main (`NUT-20`) : les valeurs ne sont plus écrasées. */
  edited_on: string | null;
}

/** Un ingrédient pesé, tel qu'il part au calcul. */
export interface IngredientLine {
  name: string;
  quantity_g: number;
  calories_100g?: number | null;
  protein_100g?: number | null;
  added_sugar_100g?: number | null;
  saturated_fat_100g?: number | null;
  fiber_100g?: number | null;
  /** Le code du produit scanné. Il ne change rien au total : il suit la ligne jusqu'au
   * catalogue, pour qu'une entrée puisse plus tard être relue chez Open Food Facts. */
  barcode?: string;
}

// ── Catalogue alimentaire (`NUT-18` → `NUT-21`) ───────

/** Les quatre plages du catalogue, **calendaires** et non glissantes. */
export type CatalogRange = 'day' | 'week' | 'month' | 'quarter';

/**
 * Une ligne de la page catalogue.
 *
 * `catalogued` à faux désigne un aliment qui n'existe qu'au **journal** : il a été mangé,
 * mais aucune ligne ne le décrit — rien à corriger ni à supprimer, et `id` vaut `-1`.
 */
export interface CatalogEntry {
  id: number;
  token: string;
  ingredient_id: string;
  name: string;
  catalogued: boolean;
  calories_100g: number | null;
  protein_100g: number | null;
  added_sugar_100g: number | null;
  saturated_fat_100g: number | null;
  fiber_100g: number | null;
  portion_g: number | null;
  barcode: string;
  edited_on: string | null;
  times: number;
  quantity_g: number;
  /** `null` veut dire « jamais consigné » — l'écran y dessine un tiret, pas un zéro. */
  last_on: string | null;
}

/** Ce que la page ne voit pas, chiffré : les repas non composés n'ont aucun aliment. */
export interface CatalogCoverage {
  composed: number;
  meals: number;
}

export interface CatalogView {
  range: CatalogRange;
  start: string;
  end: string;
  coverage: CatalogCoverage;
  entries: CatalogEntry[];
}

export interface CatalogIntake {
  date: string;
  quantity_g: number;
}

export interface CatalogPeriod {
  range: CatalogRange;
  start: string;
  end: string;
  times: number;
  quantity_g: number;
}

export interface CatalogFood {
  entry: CatalogEntry;
  periods: CatalogPeriod[];
  recent: CatalogIntake[];
}

/** Ajout d'un aliment au catalogue. Le serveur refuse une entrée sans aucune valeur. */
export interface IngredientPayload {
  name: string;
  calories_100g?: number | null;
  protein_100g?: number | null;
  added_sugar_100g?: number | null;
  saturated_fat_100g?: number | null;
  fiber_100g?: number | null;
  portion_g?: number | null;
  barcode?: string;
}

/**
 * Correction d'une entrée du catalogue.
 *
 * `clear` nomme les champs à **effacer** : sans cette liste, un champ absent et un champ
 * à `null` diraient la même chose, et une valeur fausse ne pourrait que se remplacer.
 * `release` retire le verrou posé par toute correction.
 */
export interface IngredientUpdate {
  name?: string;
  calories_100g?: number | null;
  protein_100g?: number | null;
  added_sugar_100g?: number | null;
  saturated_fat_100g?: number | null;
  fiber_100g?: number | null;
  portion_g?: number | null;
  clear?: string[];
  release?: boolean;
}

export interface ComposedLine {
  name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  added_sugar_g: number;
  saturated_fat_g: number;
  fiber_g: number;
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
  saturated_fat_g: number;
  fiber_g: number;
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
  saturated_fat_100g: number | null;
  fiber_100g: number | null;
  /** Vrai quand **aucune** des cinq valeurs n'est connue : il n'y aura rien à totaliser. */
  partial: boolean;
}

export interface MealFormValues {
  meal_type: string;
  comment: string;
  protein_g: string;
  added_sugar_g: string;
  calories: string;
  saturated_fat_g: string;
  fiber_g: string;
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
  saturated_fat_g: number | null;
  fiber_g: number | null;
  /** Faux quand le modèle annonce lui-même ne pas voir de nourriture. */
  readable: boolean;
  /** Vrai quand la réponse ne porte aucun chiffre. */
  empty: boolean;
}

/** Correction d'un repas (`NUT-09`, `NUT-15`). Photo et provenance restent au serveur. */
export interface MealUpdate {
  meal_type: string;
  comment?: string | null;
  protein_g?: number | null;
  added_sugar_g?: number | null;
  calories?: number | null;
  /**
   * **Absents, préservés ; présents — même à `null` —, appliqués** (`NUT-16`).
   *
   * Les trois valeurs d'origine remplacent : absentes, elles s'effacent. Ces deux-là sont
   * venues après, et un appelant qui les ignore ne doit pas les effacer.
   */
  saturated_fat_g?: number | null;
  fiber_g?: number | null;
  /** À ne passer que si la provenance change réellement (`NUT-04`, `NUT-09`). */
  source?: 'manual' | 'ai';
}

export function photoPath(relative: string): string {
  return `/api/nutrition/photos/${relative}`;
}

function multipart(values: MealFormValues): FormData {
  const form = new FormData();
  form.set('meal_type', values.meal_type);
  if (values.comment.trim()) form.set('comment', values.comment.trim());
  for (const field of [
    'protein_g',
    'added_sugar_g',
    'calories',
    'saturated_fat_g',
    'fiber_g',
  ] as const) {
    const raw = values[field].replace(',', '.').trim();
    if (raw) form.set(field, raw);
  }
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

  /** Tout ce qu'on mange sur une plage, et ce que la page ne voit pas (`NUT-19`). */
  catalog: (range: CatalogRange) =>
    request<CatalogView>('/api/nutrition/catalog', { query: { range } }),

  /**
   * La fiche d'un aliment : ses quatre plages et ses derniers repas.
   *
   * `foodId` est l'identifiant d'une entrée du catalogue, ou le **nom** d'un aliment qui
   * n'existe qu'au journal — la page en montre, leur fiche doit s'ouvrir aussi.
   */
  food: (foodId: string) =>
    request<CatalogFood>(`/api/nutrition/catalog/${encodeURIComponent(foodId)}`),

  addIngredient: (payload: IngredientPayload) =>
    request<Ingredient>('/api/nutrition/ingredients', { method: 'POST', body: payload }),

  updateIngredient: (id: number, token: string, payload: IngredientUpdate) =>
    request<Ingredient>(`/api/nutrition/ingredients/${String(id)}`, {
      method: 'PATCH',
      body: payload,
      headers: { 'If-Match': token },
    }),

  removeIngredient: (id: number, token: string) =>
    request<undefined>(`/api/nutrition/ingredients/${String(id)}`, {
      method: 'DELETE',
      headers: { 'If-Match': token },
    }),

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
   * Propose des macros depuis une description. **N'écrit rien** (`NUT-04`).
   *
   * Multipart alors qu'il n'y a plus de fichier à porter (`NUT-22`) : la route accepte
   * toujours une image — les repas déjà photographiés existent — et c'est elle qui refuse
   * une demande vide. Changer son format d'entrée pour le seul appelant qui reste serait
   * casser un contrat pour économiser une frontière de séparation.
   */
  analyze: (comment: string | null) => {
    const form = new FormData();
    if (comment?.trim()) form.set('comment', comment.trim());
    return request<MealEstimate>('/api/nutrition/analyze', { method: 'POST', form });
  },

  update: (id: number, token: string, payload: MealUpdate) =>
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
    saturated_fat_g?: number | null;
    fiber_g?: number | null;
  }) => request<Favorite>('/api/nutrition/favorites', { method: 'POST', body: payload }),

  replayFavorite: (favoriteId: string) =>
    request<Meal>(`/api/nutrition/favorites/${favoriteId}/replay`, { method: 'POST' }),

  removeFavorite: (id: number, token: string) =>
    request<undefined>(`/api/nutrition/favorites/${id}`, {
      method: 'DELETE',
      headers: { 'If-Match': token },
    }),
};
