/**
 * La fiche d'un aliment du plat (`NUT-14`).
 *
 * Les valeurs pour 100 g ont quitté la ligne : elles y prenaient trois champs pour un
 * chiffre qu'on ne retouche jamais depuis qu'un code-barres les apporte. Mais « invisible »
 * ne doit pas vouloir dire « introuvable » — on doit pouvoir vérifier ce qui a été
 * enregistré sous un nom, ne serait-ce que pour se rendre compte qu'on a scanné le mauvais
 * pot. Le nom de la ligne ouvre donc sa fiche.
 *
 * **Elle se lit, elle ne se modifie pas.** Une valeur pour 100 g vient d'Open Food Facts
 * ou du catalogue ; la corriger ici en ferait une troisième source, qui divergerait des
 * deux autres au premier produit reformulé. Une valeur fausse se corrige là où elle est
 * rangée — `ingredients.csv` s'ouvre dans un tableur, c'est ce que `NUT-12` promet — ou en
 * retirant la ligne et en la rescannant.
 *
 * Une **étape** de la feuille, et non une feuille de plus : le raisonnement est en tête de
 * `ScanStep.tsx`, et il vaut ici mot pour mot.
 */

import { Button } from '@/components/ui';
import { num } from '@/lib/format';

import styles from '../Nutrition.module.css';
import { hasValues, type IngredientDraft } from './ingredient-draft';

/** Une valeur pour 100 g, ou un tiret. Jamais un zéro, qui passerait pour une mesure. */
function Value({ label, value, unit }: { label: string; value: string; unit: string }) {
  const parsed = value.trim() === '' ? null : Number.parseFloat(value.replace(',', '.'));

  return (
    <div className={styles.detailValue}>
      <span className={styles.detailValueHead}>{label}</span>
      <strong>
        {parsed === null || !Number.isFinite(parsed) ? '—' : `${num(parsed, 1)} ${unit}`}
      </strong>
    </div>
  );
}

export function FoodDetail({ row, onBack }: { row: IngredientDraft; onBack: () => void }) {
  return (
    <div className={styles.detail}>
      {/* Le nom est le titre de la feuille : l'écrire ici l'aurait mis deux fois à deux
          centimètres d'écart. Ne restent que la marque et le code — qui ne sont pas des
          mesures, servent à reconnaître le produit, et n'entrent dans aucun fichier. */}
      {(row.brand !== '' || row.barcode !== '') && (
        <span className={styles.detailSource}>
          {[row.brand, row.barcode].filter((part) => part !== '').join(' · ')}
        </span>
      )}

      {hasValues(row) ? (
        <div className={styles.detailValues}>
          <span className={styles.detailValuesHead}>pour 100 g</span>
          <div className={styles.detailGrid}>
            <Value label="kcal" value={row.calories_100g} unit="" />
            <Value label="protéines" value={row.protein_100g} unit="g" />
            <Value label="sucres" value={row.added_sugar_100g} unit="g" />
          </div>
        </div>
      ) : (
        <p className={styles.note}>
          Ni Open Food Facts ni ton catalogue ne chiffrent cet aliment. Il reste dans le plat — il
          dit ce qu’il y avait dans l’assiette — mais il ne compte pas dans le total.
        </p>
      )}

      {/* Ce que le poids en fait n'est pas ici : c'est une multiplication, elle appartient
          au serveur, et « Calculer le total » la montre déjà ligne par ligne. */}
      <p className={styles.empty}>
        Ces valeurs viennent de la base. Pour en corriger une, retire l’aliment et rescanne-le.
      </p>

      <Button variant="quiet" onClick={onBack}>
        Retour
      </Button>
    </div>
  );
}
