/**
 * Les aliments d'un repas composé (`NUT-12`, `NUT-14`).
 *
 * ## Ce que la ligne montre, et ce qu'elle ne montre plus
 *
 * Une ligne portait cinq champs : le nom, le poids, et les trois valeurs pour 100 g de
 * l'emballage. C'était le seul moyen de renseigner un produit — il fallait lire son
 * étiquette à chaque repas.
 *
 * **Le code-barres a supprimé ce geste** (`NUT-13`). Les valeurs pour 100 g viennent
 * maintenant d'Open Food Facts ou du catalogue ; les laisser à l'écran gardait cinq
 * champs pour un seul qui reste à remplir, et invitait à retoucher un chiffre qu'on n'a
 * plus sous les yeux. Elles sont donc **tenues et envoyées, sans être affichées** : la
 * ligne dit l'aliment et ce qu'on en a mis, et c'est tout ce dont on dispose devant son
 * assiette.
 *
 * Elles ne sont pas perdues pour autant — le total les rend visibles là où elles ont un
 * sens, c'est-à-dire une fois multipliées par le poids, dans `CompositionTotal`.
 *
 * ## Une ligne sans valeurs se dit
 *
 * Un aliment tapé à la main que le catalogue ne connaît pas n'apporte rien au total. Avec
 * les champs à l'écran, cela se voyait — ils étaient vides. Sans eux, la ligne
 * ressemblerait à toutes les autres tout en ne comptant pas. Elle porte donc une mention,
 * discrète et explicite. C'est le même parti pris que partout : un état se dit, il ne se
 * devine pas.
 *
 * ## Retirer une ligne ne se confirme pas
 *
 * C'est la règle du dépôt : une **addition** se défait, puisque c'est la suppression que
 * l'utilisateur ferait de toute façon. Rien n'est écrit avant l'enregistrement du repas,
 * et une ligne retirée par erreur se rescanne. Demander confirmation ici finirait par
 * faire ignorer la confirmation là où elle compte — la destruction d'un repas déjà
 * enregistré.
 */

import { Button, Combobox, Field, type Suggestion } from '@/components/ui';
import type { ComposedLine, Ingredient } from '@/features/nutrition/api';
import { integer, num } from '@/lib/format';

import { emptyIngredient, fieldText, hasValues, type IngredientDraft } from './ingredient-draft';

import styles from '../Nutrition.module.css';

function IngredientRow({
  row,
  catalogue,
  onChange,
  onRemove,
  onInspect,
  weighing,
}: {
  row: IngredientDraft;
  catalogue: readonly Ingredient[];
  onChange: (next: IngredientDraft) => void;
  onRemove: () => void;
  /** Ouvre la fiche de l'aliment — ce que le nom fait quand on le touche. */
  onInspect: () => void;
  /** Cette ligne vient d'arriver par un scan : c'est le poids qu'il reste à taper. */
  weighing: boolean;
}) {
  const options: Suggestion[] = catalogue.map((item) => ({
    value: item.name,
    hint: item.calories_100g === null ? undefined : `${integer(item.calories_100g)} kcal/100 g`,
  }));

  /**
   * Choisir un ingrédient connu rapporte ses trois valeurs — **sans les montrer**.
   *
   * C'est tout l'intérêt du catalogue, et il compte double depuis que les champs ont
   * quitté l'écran : sans lui, un aliment tapé à la main ne pèserait rien dans le total.
   */
  function recall(name: string): void {
    const known = catalogue.find(
      (item) => item.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (!known) {
      onChange({ ...row, name });
      return;
    }
    onChange({
      ...row,
      name: known.name,
      calories_100g: fieldText(known.calories_100g),
      protein_100g: fieldText(known.protein_100g),
      added_sugar_100g: fieldText(known.added_sugar_100g),
    });
  }

  return (
    <div className={styles.food}>
      {/* Un nom scanné s'affiche, un nom manuel se saisit. Rendre les deux en champ
          inviterait à retoucher un libellé qui vient de la base — et c'est sur le nom que
          le catalogue se rattache au produit. */}
      {row.manual ? (
        <Combobox
          className={styles.foodPick}
          label="Ingrédient"
          placeholder="riz basmati"
          value={row.name}
          options={options}
          onChange={(value) => {
            onChange({ ...row, name: value });
          }}
          onSelect={(option) => {
            recall(option.value);
          }}
        />
      ) : (
        /* Le nom est une cible : il ouvre la fiche de l'aliment. C'est ce qui rend les
           valeurs pour 100 g **invisibles sans être introuvables** — on doit pouvoir
           vérifier ce qui a été enregistré sous ce nom. */
        <button
          type="button"
          className={styles.foodName}
          // Le nom seul ne dirait pas ce que la touche fait, et l'indice « voir la
          // fiche » se ferait lire à chaque ligne. Un nom accessible qui annonce
          // l'action, comme le fait déjà « Retirer <aliment> » juste à côté.
          aria-label={`Fiche de ${row.name}`}
          onClick={onInspect}
        >
          <span className={styles.foodLabel}>
            {row.name}
            {/* Le chevron du parcours mobile : il dit « ça s'ouvre » sans prendre de
                hauteur. Une phrase sous le nom — « voir la fiche » — l'aurait dit aussi,
                et aurait ajouté une ligne à chaque aliment d'une liste qui doit rester
                fine. Vu à l'écran, pas dans un test. */}
            <span className={styles.foodChevron} aria-hidden="true" />
          </span>
          {/* La seule mention qui reste : celle qui change ce que la ligne vaut. */}
          {!hasValues(row) && <span className={styles.foodUnknown}>valeurs inconnues</span>}
        </button>
      )}

      <Field
        className={styles.foodQuantity}
        label={`Grammes de ${row.name.trim() === '' ? 'cet ingrédient' : row.name}`}
        hideLabel
        unit="g"
        inputMode="decimal"
        autoFocus={weighing}
        value={row.quantity_g}
        onChange={(event) => {
          onChange({ ...row, quantity_g: event.target.value });
        }}
      />

      {/* Une addition se défait sans confirmation : rien n'est encore écrit. */}
      <button
        type="button"
        className={styles.foodRemove}
        aria-label={`Retirer ${row.name.trim() === '' ? 'cet ingrédient' : row.name}`}
        onClick={onRemove}
      >
        retirer
      </button>
    </div>
  );
}

export function IngredientTable({
  rows,
  catalogue,
  onChange,
  onScan,
  onInspect,
  weighing,
}: {
  rows: readonly IngredientDraft[];
  catalogue: readonly Ingredient[];
  onChange: (rows: IngredientDraft[]) => void;
  /** Ouvre la surface de scan (`NUT-13`). */
  onScan: () => void;
  /** Ouvre la fiche d'un aliment, par la clé de sa ligne (`NUT-14`). */
  onInspect: (key: string) => void;
  /** Clé de la ligne arrivée par un scan, qui attend son poids. */
  weighing: string | null;
}) {
  return (
    <div className={styles.ingredients}>
      {/* **Le plat commence vide, et le dit.** Une ligne vierge posée d'avance était un
          formulaire de cinq champs à traverser avant d'atteindre le geste qui compte. */}
      {rows.length === 0 ? (
        <p className={styles.empty}>
          Aucun aliment. Scanne un code-barres — le nom et les valeurs pour 100 g viennent avec, il
          ne reste que le poids.
        </p>
      ) : (
        rows.map((row, index) => (
          <IngredientRow
            key={row.key}
            row={row}
            catalogue={catalogue}
            weighing={row.key === weighing}
            onInspect={() => {
              onInspect(row.key);
            }}
            onChange={(next) => {
              onChange(rows.map((item, position) => (position === index ? next : item)));
            }}
            onRemove={() => {
              onChange(rows.filter((_, position) => position !== index));
            }}
          />
        ))
      )}

      {/* **Deux portes, et l'ordre dit laquelle est la principale.** Le scan remplit le
          nom et les valeurs pour 100 g ; la saisie à la main reste pour ce qui n'a pas de
          code-barres — un plat cuisiné, des légumes en vrac, un reste. La retirer aurait
          rendu le repas composé dépendant d'un service tiers et d'un réseau. */}
      <div className={styles.ingredientActions}>
        <Button variant="ghost" onClick={onScan}>
          Ajouter un aliment
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            onChange([...rows, emptyIngredient()]);
          }}
        >
          Ajouter à la main
        </Button>
      </div>
    </div>
  );
}

/**
 * Le total, et le détail de chaque ligne.
 *
 * **Ce n'est pas une proposition.** Le vocabulaire de la proposition — `AiBlock`, l'état
 * `proposed` d'un pas-à-pas — est réservé à ce qu'un modèle rend. Ici, c'est une
 * multiplication sur des chiffres saisis : la marquer comme une estimation affaiblirait
 * la marque là où elle sert vraiment.
 */
export function CompositionTotal({
  lines,
  calories,
  proteinG,
  addedSugarG,
  empty,
}: {
  lines: readonly ComposedLine[];
  calories: number;
  proteinG: number;
  addedSugarG: number;
  empty: boolean;
}) {
  if (empty) {
    return (
      <p className={styles.empty}>
        Aucun ingrédient n’a de valeur pour 100 g : il n’y a rien à totaliser. Le repas s’enregistre
        quand même, avec ses ingrédients et sans ses macros.
      </p>
    );
  }

  return (
    <div className={styles.total}>
      <div className={styles.totalHead}>
        <strong>{integer(calories)} kcal</strong>
        <span>
          {num(proteinG, 0)} g prot. · {num(addedSugarG, 0)} g sucres
        </span>
      </div>
      <ul className={styles.totalLines}>
        {lines.map((line) => (
          <li key={line.name}>
            <span>{line.name}</span>
            <span>
              {num(line.quantity_g, 0)} g · {integer(line.calories)} kcal
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
