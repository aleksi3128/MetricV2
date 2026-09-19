/**
 * Ce que la feuille d'ajout tient pendant la saisie, et ce qui survit à sa fermeture.
 *
 * `Sheet` a **quatre portes de sortie** — la poignée, le voile, Échap, le bouton nommé —
 * et la feuille vidait tout à chacune. C'est le bon comportement pour « annuler » ; c'en
 * est un mauvais pour un pouce qui dérape sur le voile, un appel qui arrive, ou l'aller
 * simple vers l'application Appareil photo. Un repas composé se note en cinq champs par
 * ingrédient : les retaper est cher pour un geste qu'on n'a pas voulu.
 *
 * La saisie est donc rangée à chaque frappe, et reprise à la réouverture.
 *
 * ## Quinze minutes, et pas « toujours »
 *
 * Un brouillon éternel ressort au repas suivant — le lendemain, à un autre repas — et ses
 * champs décrivent alors **une autre assiette**. Ce serait la pire des valeurs à l'écran :
 * plausible, et fausse. Quinze minutes est la largeur d'un repas qu'on note.
 *
 * Passé ce délai, la feuille repart du choix du mode, en mémoire comme après un
 * rechargement — une seule règle à comprendre plutôt que deux durées de vie.
 *
 * ## L'horodatage n'est pas une date de donnée
 *
 * `Date.now()` ici ne date rien : ce nombre ne quitte pas le navigateur, n'entre dans
 * aucun CSV, et ne sert qu'à décider si les champs valent encore d'être remontrés. Dater
 * le repas reste au serveur, comme partout ailleurs.
 *
 * ## La photo ne tient pas dans le brouillon
 *
 * Un `File` n'est pas du JSON. Le garder demanderait de le réencoder en base64 —
 * l'équivalent de 800 Ko sur les 5 Mo du stockage, pour une photo déjà réduite — et le
 * dépassement de quota est une erreur qu'on découvre en échouant. Elle reste donc en
 * mémoire : fermer et rouvrir la feuille la garde, un rechargement de la page la perd, et
 * la feuille **le dit** plutôt que de montrer un cadre vide.
 */

import type { MealEstimate, MealFormValues } from '@/features/nutrition/api';

import { emptyIngredient, isBlank, type IngredientDraft } from './ingredient-draft';

/** Les cinq modes de saisie de la feuille, dans l'ordre où elle les propose. */
export type MealMode = 'photo' | 'photo-texte' | 'texte' | 'manuel' | 'compose';

/**
 * Les cinq valeurs qu'une estimation peut proposer, et que l'écran marque comme telles.
 *
 * Trois jusqu'à `NUT-16`. Un brouillon rangé avant ne porte pas les deux dernières : ses
 * champs se relisent vides, ce qui est ce qu'ils étaient.
 */
export type Macro = 'protein_g' | 'added_sugar_g' | 'calories' | 'saturated_fat_g' | 'fiber_g';

/**
 * Une saisie en cours.
 *
 * `values` est celui du formulaire **moins la photo** : le `Omit` fait que le jour où un
 * champ s'ajoute à `MealFormValues`, ce fichier cesse de compiler tant qu'il ne le range
 * pas. Un brouillon qui oublie un champ en silence est un brouillon qui ment.
 */
export interface MealDraft {
  mode: MealMode;
  values: Omit<MealFormValues, 'photo'>;
  rows: IngredientDraft[];
  /** Les macros encore proposées : sans elles, une valeur du modèle repasserait pour une saisie. */
  proposed: Macro[];
  estimate: MealEstimate | null;
  /** Vrai quand la saisie portait une photo — c'est ce que la feuille annonce à la reprise. */
  photo: boolean;
  /** Quand ce brouillon a été rangé, en millisecondes locales. Voir l'en-tête. */
  saved_at: number;
}

/** Même préfixe que `metric.token` et `metric.theme` : tout ce que l'application range est sous `metric.`. */
const DRAFT_KEY = 'metric.meal-draft';

/** Quinze minutes, comptées depuis la **dernière frappe** et non depuis l'ouverture. */
export const DRAFT_TTL_MS = 15 * 60 * 1000;

/**
 * Les modes connus, en `Record` et non en tableau : ajouter un mode au type sans le
 * déclarer ici ne compile pas, et un brouillon d'une version précédente ne peut donc pas
 * ressusciter un mode qui n'existe plus.
 */
const MODES: Record<MealMode, true> = {
  photo: true,
  'photo-texte': true,
  texte: true,
  manuel: true,
  compose: true,
};

const MACROS: Record<Macro, true> = {
  protein_g: true,
  added_sugar_g: true,
  calories: true,
  saturated_fat_g: true,
  fiber_g: true,
};

// ── Lecture défensive ─────────────────────────────────
//
// Tout ce qui suit relit du texte écrit par une version antérieure de l'application, ou
// abîmé. Rien n'y est supposé : un champ absent vaut vide, et une forme inattendue rend
// `null` plutôt que de peupler le formulaire de moitiés d'objets.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseValues(raw: unknown): MealDraft['values'] {
  const fields = isRecord(raw) ? raw : {};
  return {
    meal_type: text(fields.meal_type),
    comment: text(fields.comment),
    protein_g: text(fields.protein_g),
    added_sugar_g: text(fields.added_sugar_g),
    calories: text(fields.calories),
    saturated_fat_g: text(fields.saturated_fat_g),
    fiber_g: text(fields.fiber_g),
    // La provenance ne se devine pas : hors du `ai` explicite, c'est une saisie.
    source: fields.source === 'ai' ? 'ai' : 'manual',
  };
}

/**
 * Les lignes d'ingrédients, **re-clefées**.
 *
 * Un tableau vide est rendu tel quel : depuis `NUT-14`, un plat sans aliment est un état
 * normal — c'est celui sur lequel le mode composé s'ouvre.
 *
 * `emptyIngredient` compte depuis zéro à chaque chargement de page : reprendre les clés
 * du brouillon rendrait `ingredient-1` à deux lignes dès le premier ajout, et React
 * mélangerait leurs champs. Le défaut ne se voit qu'en ajoutant une ligne après une
 * reprise — assez tard pour ne jamais être imputé à la reprise.
 */
function parseRows(raw: unknown): IngredientDraft[] {
  if (!isArray(raw)) return [];
  return raw.filter(isRecord).map((row) => ({
    ...emptyIngredient(),
    name: text(row.name),
    quantity_g: text(row.quantity_g),
    calories_100g: text(row.calories_100g),
    protein_100g: text(row.protein_100g),
    added_sugar_100g: text(row.added_sugar_100g),
    saturated_fat_100g: text(row.saturated_fat_100g),
    fiber_100g: text(row.fiber_100g),
    // Une ligne d'un brouillon antérieur à `NUT-14` n'a pas ce champ. La tenir pour
    // manuelle rend son nom saisissable : c'est le repli qui ne bloque rien.
    manual: row.manual !== false,
    brand: text(row.brand),
    barcode: text(row.barcode),
  }));
}

function parseProposed(raw: unknown): Macro[] {
  if (!isArray(raw)) return [];
  return raw.filter(
    (item): item is Macro => typeof item === 'string' && Object.hasOwn(MACROS, item),
  );
}

/**
 * L'estimation telle que le modèle l'avait rendue.
 *
 * Elle est reprise, et pas seulement les champs qu'elle a remplis : sans elle, les
 * pointillés du `Stepper` reviendraient sans la phrase qui explique d'où ils sortent, et
 * une valeur proposée sans sa provenance n'est plus une proposition.
 */
function parseEstimate(raw: unknown): MealEstimate | null {
  if (!isRecord(raw)) return null;
  return {
    comment: typeof raw.comment === 'string' ? raw.comment : null,
    protein_g: nullableNumber(raw.protein_g),
    added_sugar_g: nullableNumber(raw.added_sugar_g),
    calories: nullableNumber(raw.calories),
    saturated_fat_g: nullableNumber(raw.saturated_fat_g),
    fiber_g: nullableNumber(raw.fiber_g),
    readable: raw.readable !== false,
    empty: raw.empty === true,
  };
}

/**
 * Y a-t-il quelque chose à reprendre ?
 *
 * Un mode choisi et rien tapé n'en est pas un : le ranger ferait sauter la question du
 * mode à la réouverture, pour un formulaire vide. Le type de repas non plus — il est
 * pré-rempli par le serveur, le retenir seul reviendrait à retenir sa suggestion.
 */
export function worthKeeping(draft: MealDraft): boolean {
  if (draft.photo || draft.estimate !== null) return true;
  const { comment, protein_g, added_sugar_g, calories, saturated_fat_g, fiber_g } = draft.values;
  if (
    [comment, protein_g, added_sugar_g, calories, saturated_fat_g, fiber_g].some(
      (field) => field.trim() !== '',
    )
  ) {
    return true;
  }
  return draft.rows.some((row) => !isBlank(row));
}

/** Le texte rangé, ou rien — un stockage verrouillé se lit comme un stockage vide. */
function storedText(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

/**
 * Le brouillon en cours, ou `null` s'il n'y en a pas — ou plus.
 *
 * `now` est un paramètre pour que le délai s'éprouve sur des valeurs fixes, sans horloge
 * simulée. Un brouillon périmé est **effacé** au passage : le laisser pourrir ferait
 * reposer la question à chaque ouverture.
 */
export function readDraft(now: number = Date.now()): MealDraft | null {
  const stored = storedText();
  if (stored === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    clearDraft();
    return null;
  }
  if (!isRecord(parsed)) {
    clearDraft();
    return null;
  }

  const savedAt = nullableNumber(parsed.saved_at);
  if (savedAt === null || now - savedAt > DRAFT_TTL_MS) {
    clearDraft();
    return null;
  }

  const mode = parsed.mode;
  if (typeof mode !== 'string' || !Object.hasOwn(MODES, mode)) {
    clearDraft();
    return null;
  }

  return {
    mode: mode as MealMode,
    values: parseValues(parsed.values),
    rows: parseRows(parsed.rows),
    proposed: parseProposed(parsed.proposed),
    estimate: parseEstimate(parsed.estimate),
    photo: parsed.photo === true,
    saved_at: savedAt,
  };
}

/**
 * Range la saisie, ou efface ce qui reste s'il n'y a plus rien à garder.
 *
 * Un stockage indisponible — navigation privée sous Safari, quota plein — ne fait rien
 * échouer : la saisie vit de toute façon en mémoire, et ne pas survivre à un rechargement
 * est une dégradation, pas une panne. Même parti pris que le thème.
 */
export function writeDraft(draft: MealDraft): void {
  if (!worthKeeping(draft)) {
    clearDraft();
    return;
  }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Voir ci-dessus.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Voir ci-dessus.
  }
}
