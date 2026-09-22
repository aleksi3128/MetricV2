/**
 * Le catalogue alimentaire — `/nutrition/catalogue` (`NUT-19`).
 *
 * Le plan est dans `docs/catalogue-alimentaire.md`. Ce que la page sert à faire tient en
 * une phrase : voir tout ce qu'on mange, et tenir la liste des aliments que la feuille
 * « repas composé » saura reconnaître.
 *
 * ## Une page, et non une feuille
 *
 * Une feuille se referme pour laisser revenir à ce qu'on faisait. Ici on vient **lire**,
 * comparer deux plages, ouvrir trois fiches — et on y revient. C'est le même arbitrage que
 * `/activite/charges`, qui aurait pu tenir dans une feuille et n'y tient pas.
 *
 * ## Ce que la page dit de son propre trou
 *
 * Photo, saisie manuelle, favori et estimation IA n'enregistrent **aucun aliment** : ils
 * n'ont qu'un total d'assiette. Une page qui ne le dirait pas laisserait lire « 0 g de
 * poulet ce mois-ci » après quatre repas notés en photo — un mensonge crédible, c'est-à-dire
 * le pire type. La ligne de couverture est donc fixe, et ses deux chiffres viennent du
 * serveur.
 *
 * ## Deux sortes de lignes
 *
 * Celles du catalogue, qui se corrigent et se suppriment, et celles qui n'existent qu'au
 * **journal** — « 150 g de légumes » n'a aucune valeur pour 100 g, n'entre pas au
 * catalogue, et a pourtant été mangé. Les taire ferait mentir la promesse de la page. Même
 * parti pris que `LoadList.orphans`, et même conséquence : rien à détruire sur ces
 * lignes-là, puisqu'il n'y a pas de ligne à détruire.
 *
 * ## L'historique commence aujourd'hui
 *
 * Les quantités mangées n'ont jamais été enregistrées avant `NUT-18` : les repas composés
 * calculaient leur total et jetaient leurs lignes. Rien n'est reconstructible, et l'état
 * vide le dit en toutes lettres plutôt que de laisser croire à une panne.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import {
  Button,
  Card,
  Empty,
  LinkButton,
  PageHead,
  Rule,
  Segmented,
  Skeleton,
  SwipeRow,
  type SegmentedOption,
} from '@/components/ui';
import { nutritionApi, type CatalogEntry, type CatalogRange } from '@/features/nutrition/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { integer, plural } from '@/lib/format';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import { AddFoodSheet } from './AddFoodSheet';
import styles from './Catalog.module.css';
import { foodKey, reading, seenOn } from './catalog-draft';
import { FoodSheet } from './FoodSheet';

const RANGES: readonly SegmentedOption<CatalogRange>[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'quarter', label: '3 mois' },
];

/** Comment la plage se nomme dans une phrase — « 4 repas sur 9 **cette semaine** ». */
const SAID: Record<CatalogRange, string> = {
  day: 'aujourd’hui',
  week: 'cette semaine',
  month: 'ce mois-ci',
  quarter: 'ce trimestre',
};

function Line({ entry, onOpen }: { entry: CatalogEntry; onOpen: () => void }) {
  const last = seenOn(entry);
  const id = useId();

  return (
    /*
     * **Le nom accessible dit l'action, la description dit les chiffres.**
     *
     * Sans `aria-label`, le nom de la cible serait tout son contenu collé — « riz
     * basmati3 fois · 540 gaujourd'hui » —, ce qui s'entend mal et ne se vise pas : la
     * table `SURFACES` de l'audit cherche un nom **exact**, et cette fiche y était
     * introuvable. Mais un `aria-label` seul **remplace** le contenu, et les deux
     * chiffres de la ligne disparaîtraient de ce qu'on entend.
     *
     * `aria-describedby` les rend après le nom : « Fiche de riz basmati, 3 fois · 540 g,
     * aujourd'hui ». Le nom reste stable, rien n'est perdu.
     */
    <button
      type="button"
      className={styles.line}
      aria-label={`Fiche de ${entry.name}`}
      aria-describedby={`${id}-compte ${id}-note`}
      onClick={onOpen}
    >
      <span className={styles.lineName}>
        {entry.name}
        <span className={styles.lineChevron} aria-hidden="true" />
      </span>
      <span id={`${id}-compte`} className={styles.lineCount}>
        {reading(entry)}
      </span>
      {/* Deux mentions qui ne se confondent pas : « jamais consigné » dit qu'aucun repas
          ne le porte, « hors catalogue » dit qu'aucune ligne ne le décrit. Un aliment
          peut être l'un, l'autre, ou les deux. */}
      <span id={`${id}-note`} className={styles.lineNote}>
        {[last, entry.catalogued ? null : 'hors catalogue']
          .filter((part) => part !== null)
          .join(' · ')}
      </span>
    </button>
  );
}

export function Catalog() {
  const client = useQueryClient();
  const { notify } = useToast();

  const [range, setRange] = useState<CatalogRange>('week');
  const [opened, setOpened] = useState<CatalogEntry | null>(null);
  const [adding, setAdding] = useState(false);
  /** Le nom que la feuille d'ajout reprend, quand elle s'ouvre depuis un aliment mangé. */
  const [prefill, setPrefill] = useState('');

  const { data, isPending, error } = useQuery({
    queryKey: keys.nutrition.catalog(range),
    queryFn: () => nutritionApi.catalog(range),
  });

  function invalidate(): void {
    void client.invalidateQueries({ queryKey: keys.nutrition.all() });
  }

  const remove = useMutation({
    mutationFn: (entry: CatalogEntry) => nutritionApi.removeIngredient(entry.id, entry.token),
    onSuccess: (_result, entry) => {
      invalidate();
      notify(`${entry.name} · retiré du catalogue`, 'signal');
    },
    onError: (failure: unknown) => {
      notify(
        failure instanceof ApiError ? failure.message : 'La suppression n’a pas abouti.',
        'signal',
      );
    },
  });

  const entries = data?.entries ?? [];
  const eaten = entries.filter((entry) => entry.last_on !== null);
  const never = entries.filter((entry) => entry.last_on === null);

  function row(entry: CatalogEntry) {
    const line = (
      <Line
        entry={entry}
        onOpen={() => {
          setOpened(entry);
        }}
      />
    );

    // Une ligne hors catalogue n'a rien à détruire : elle n'existe qu'au journal, et le
    // journal est une mesure. L'envelopper dans un `SwipeRow` promettrait un geste qui
    // n'aboutirait pas.
    if (!entry.catalogued) {
      return (
        <div key={`journal-${entry.name}`} className={styles.lineWrap}>
          {line}
        </div>
      );
    }

    return (
      <SwipeRow
        key={`${String(entry.id)}-${entry.token}`}
        actionLabel={`Retirer ${entry.name} du catalogue`}
        busy={remove.isPending && remove.variables?.id === entry.id}
        onAction={() => {
          remove.mutate(entry);
        }}
      >
        {line}
      </SwipeRow>
    );
  }

  return (
    <div className={cx('wrap', styles.screen)}>
      <PageHead
        eyebrow="Nutrition"
        title="Catalogue alimentaire"
        actions={
          <LinkButton variant="quiet" to="/nutrition">
            Retour
          </LinkButton>
        }
      >
        Tout ce que tu manges, et ce que la feuille « repas composé » sait reconnaître.
      </PageHead>

      <Segmented label="Plage" options={RANGES} value={range} onChange={setRange} />

      {/* La couverture, servie par le serveur. Elle n'apparaît qu'une fois la plage lue :
          l'écrire pendant le chargement ferait deux chiffres à zéro qu'on lirait comme
          une réponse. */}
      {data !== undefined && (
        <p className={styles.coverage}>
          {data.coverage.meals === 0
            ? `Aucun repas noté ${SAID[range]}.`
            : `Ne compte que les repas composés — ${integer(data.coverage.composed)} sur ${integer(data.coverage.meals)} ${plural(data.coverage.meals, 'repas', 'repas')} ${SAID[range]}.`}
        </p>
      )}

      <Card>
        {/* Quatre états, et l'erreur en fait partie. Sans elle, une lecture en échec
            laisserait `data` indéfini et la page afficherait « aucun aliment » — elle
            affirmerait qu'on ne mange rien alors qu'elle n'a rien pu lire. */}
        {isPending ? (
          <Skeleton lines={4} />
        ) : error ? (
          <Empty title="Catalogue indisponible">
            {error instanceof Error ? error.message : 'Le serveur n’a pas répondu.'}
          </Empty>
        ) : entries.length === 0 ? (
          <Empty
            title="Aucun aliment"
            action={
              <Button
                onClick={() => {
                  setPrefill('');
                  setAdding(true);
                }}
              >
                Ajouter un aliment
              </Button>
            }
          >
            Les quantités mangées se notent depuis les repas composés : l’historique commence au
            premier d’entre eux. Les repas notés en photo ou à la main n’y entrent pas.
          </Empty>
        ) : (
          <div className={styles.lines}>{eaten.map((entry) => row(entry))}</div>
        )}
      </Card>

      {never.length > 0 && (
        <>
          <Rule>Au catalogue, jamais consigné</Rule>
          <Card>
            <div className={styles.lines}>{never.map((entry) => row(entry))}</div>
          </Card>
        </>
      )}

      {entries.length > 0 && (
        <div className={styles.add}>
          <Button
            onClick={() => {
              setPrefill('');
              setAdding(true);
            }}
          >
            Ajouter un aliment
          </Button>
        </div>
      )}

      <FoodSheet
        // Une fiche par aliment ouvert : rouvrir repart de la lecture, pas de la
        // correction laissée en plan sur une autre ligne.
        key={opened === null ? 'fermee' : foodKey(opened)}
        entry={opened}
        onClose={() => {
          setOpened(null);
        }}
        onSaved={() => {
          setOpened(null);
          invalidate();
        }}
        onCatalogue={(name) => {
          setOpened(null);
          setPrefill(name);
          setAdding(true);
        }}
      />

      <AddFoodSheet
        // Remontée à chaque ouverture : la saisie repart propre, et reprend le nom qu'on
        // lui donne. Un effet qui remettrait l'état à zéro serait un rendu en cascade.
        key={adding ? `ajout-${prefill}` : 'ferme'}
        open={adding}
        name={prefill}
        onClose={() => {
          setAdding(false);
          setPrefill('');
        }}
        onSaved={(name) => {
          setAdding(false);
          setPrefill('');
          invalidate();
          notify(`${name} · au catalogue`);
        }}
      />
    </div>
  );
}
