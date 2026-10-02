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

import { fieldText, hasValues, type IngredientDraft } from './ingredient-draft';

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
   * Un nom connu du catalogue rapporte ses cinq valeurs — **sans les montrer**.
   *
   * ## Appelée à **chaque frappe**, et non sur le seul appui d'une suggestion (`NUT-24`)
   *
   * C'était le défaut le plus cher de cette surface, et il était invisible. `recall`
   * n'écoutait que `onSelect`, or `Combobox` **masque** la suggestion dès que le texte
   * tapé l'égale : taper « riz basmati » en entier — un aliment du catalogue, à
   * 356 kcal/100 g — ne laissait plus rien à choisir, la ligne partait sans valeurs, et le
   * plat s'enregistrait sans macros. Plus on tapait juste, plus on était sûr de n'avoir
   * rien. Mesuré à l'écran, jamais vu par un test.
   *
   * ## Un nom qui ne correspond plus **efface** ce qui avait été rappelé
   *
   * Sans cela, corriger « riz basmati » en « riz complet » — que le catalogue ignore —
   * garderait les calories du premier sous le nom du second. Une ligne manuelle ne tient
   * donc jamais que les valeurs du nom qu'elle porte **en cet instant**, et ce n'est pas
   * une perte : elles reviennent au caractère près.
   *
   * Le rapprochement reste **exact** — repli de casse et d'espaces, rien de plus. Un
   * rapprochement approximatif finirait par attribuer à un yaourt les calories de l'autre,
   * et le dépôt le refuse partout ailleurs pour la même raison.
   */
  function recall(name: string): void {
    const known = catalogue.find(
      (item) => item.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (!known) {
      onChange({
        ...row,
        name,
        calories_100g: '',
        protein_100g: '',
        added_sugar_100g: '',
        saturated_fat_100g: '',
        fiber_100g: '',
        portion_g: '',
        barcode: '',
      });
      return;
    }
    onChange({
      ...row,
      name: known.name,
      calories_100g: fieldText(known.calories_100g),
      protein_100g: fieldText(known.protein_100g),
      added_sugar_100g: fieldText(known.added_sugar_100g),
      saturated_fat_100g: fieldText(known.saturated_fat_100g),
      fiber_100g: fieldText(known.fiber_100g),
      // La portion ne remplit rien : elle arme la puce sous le champ (`NUT-21`).
      portion_g: fieldText(known.portion_g),
      barcode: known.barcode,
    });
  }

  return (
    <div className={styles.food}>
      {/* Un nom scanné s'affiche, un nom manuel se saisit. Rendre les deux en champ
          inviterait à retoucher un libellé qui vient de la base — et c'est sur le nom que
          le catalogue se rattache au produit. */}
      {row.manual ? (
        <div className={styles.foodPick}>
          <Combobox
            label="Ingrédient"
            placeholder="riz basmati"
            value={row.name}
            options={options}
            // Le même chemin pour la frappe et pour l'appui : deux chemins, c'est
            // exactement ce qui avait produit une ligne sans valeurs (voir `recall`).
            onChange={recall}
            onSelect={(option) => {
              recall(option.value);
            }}
          />
          {/* **Ce que la ligne vaut, dit sous son nom** (`NUT-24`).
              La mention existait déjà — mais dans la branche d'en dessous, celle des
              lignes scannées, qui portent toujours leurs valeurs. Elle était donc affichée
              là où le cas ne peut pas arriver, et absente là où il est la règle.
              Rien tant que le champ est vide : une ligne qu'on vient d'ouvrir n'a pas de
              valeurs inconnues, elle n'a pas encore de nom. */}
          {row.name.trim() !== '' && (
            <span className={hasValues(row) ? styles.foodRecalled : styles.foodUnknown}>
              {/* **La valeur, et non une porte vers elle.** Une touche « voir la fiche »
                  sous chaque aliment aurait été une cible de moins de 44 px — le dépôt
                  n'en admet qu'une seule exemption, et ce n'est pas celle-ci — ou aurait
                  ajouté la hauteur d'un doigt par ligne à un plat qui en compte cinq. Les
                  calories pour 100 g sont ce qu'on vérifie d'un coup d'œil : c'est le
                  chiffre qui dit qu'on a rappelé le bon aliment. */}
              {hasValues(row) ? `${row.calories_100g} kcal/100 g` : 'valeurs inconnues'}
            </span>
          )}
        </div>
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

      {/* **La portion habituelle ne préremplit pas le champ** (`NUT-21`). Un poids inscrit
          sans qu'on l'ait pesé serait une valeur inventée, et le marquer « proposé »
          créerait un cinquième vocabulaire de proposition. Une puce le remplit d'un appui :
          le geste économisé est le même, et rien n'entre dans un champ sans que le doigt
          l'ait demandé.

          Elle est un **item de la grille**, sous la colonne du poids, et non un enfant de
          celle-ci : dans la colonne, elle en doublait la hauteur et désalignait le nom et
          « retirer » de la même ligne. Vu en capture, comme le reste. */}
      {row.portion_g !== '' && row.quantity_g.trim() === '' && (
        <button
          type="button"
          className={styles.foodPortion}
          // Le libellé tient dans 92 px, l'intention non : sans ce nom accessible,
          // « 180 g » sous un champ de grammes se lirait comme une valeur déjà là.
          aria-label={`Peser la portion habituelle de ${row.name}, ${row.portion_g} g`}
          onClick={() => {
            onChange({ ...row, quantity_g: row.portion_g });
          }}
        >
          {`${row.portion_g} g`}
        </button>
      )}

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
  onPick,
  onInspect,
  weighing,
}: {
  rows: readonly IngredientDraft[];
  catalogue: readonly Ingredient[];
  onChange: (rows: IngredientDraft[]) => void;
  /** Ouvre l'étape de choix : catalogue, code-barres, ou saisie à la main (`NUT-23`). */
  onPick: () => void;
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
          Aucun aliment. Choisis-en un au catalogue ou scanne son code-barres — le nom et les
          valeurs pour 100 g viennent avec, il ne reste que le poids.
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

      {/* **Une porte, et les chemins derrière** (`NUT-23`). Il y en avait deux ici, et
          l'ordre disait laquelle est la principale : le scan d'abord, la saisie à la main
          ensuite. Le geste quotidien — reprendre un aliment déjà connu — n'en avait aucune,
          et se faisait par la seconde en espérant que le catalogue réponde. Le choix est
          maintenant dans `PickStep`, qui nomme le catalogue et le code-barres ; la saisie
          à la main y a été retirée, et son en-tête dit par où elle passe désormais. */}
      <div className={styles.ingredientActions}>
        <Button variant="ghost" onClick={onPick}>
          Ajouter un aliment
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
  saturatedFatG,
  fiberG,
  empty,
}: {
  lines: readonly ComposedLine[];
  calories: number;
  proteinG: number;
  addedSugarG: number;
  saturatedFatG: number;
  fiberG: number;
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
        {/* Une décimale pour les deux dernières : leurs quantités tiennent souvent sous
            10 g, et « 1 g » de graisses saturées pour 0,6 g arrondirait du simple au double. */}
        <span>
          {num(proteinG, 0)} g prot. · {num(addedSugarG, 0)} g sucres · {num(saturatedFatG, 1)} g AG
          saturés · {num(fiberG, 1)} g fibres
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
