/**
 * La fiche d'un aliment du catalogue (`NUT-19`, `NUT-20`, `NUT-21`).
 *
 * Même vocabulaire que la fiche d'un aliment du plat (`NUT-14`) et que celle d'un repas
 * (`NUT-15`) : toucher une ligne ouvre une feuille qui dit ce qui est enregistré. Ce que
 * celle-ci ajoute, c'est **ce qu'on en a mangé** — les quatre plages d'un coup, et les
 * derniers repas où l'aliment apparaît.
 *
 * ## Pourquoi les derniers repas sont là
 *
 * Pour que « 720 g cette semaine » soit vérifiable au lieu d'être à croire. Un chiffre
 * agrégé qu'on ne peut pas ouvrir est un chiffre qu'on finit par ne plus questionner, et
 * celui-ci dépend d'un rapprochement de noms qui peut, lui, se tromper de produit.
 *
 * ## La correction est une étape, pas une seconde feuille
 *
 * Le raisonnement est en tête de `ScanStep.tsx` et vaut ici mot pour mot : deux `Sheet`
 * empilées partagent l'écouteur `Échap`, le verrou de défilement et la restitution du
 * focus, et chacun des trois casse.
 *
 * ## Le verrou
 *
 * Toute correction pose `edited_on` : l'entrée ne sera plus écrasée par un scan. C'est ce
 * qui fait qu'une valeur corrigée tient — sans lui, « la dernière saisie gagne » avalerait
 * la correction au repas suivant, sans un mot. « Reprendre les valeurs de la base » rend
 * la main, et le dit aussi.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Field, Sheet, Skeleton } from '@/components/ui';
import { nutritionApi, type CatalogEntry, type CatalogRange } from '@/features/nutrition/api';
import { ApiError } from '@/lib/api';
import { dayMonth, num } from '@/lib/format';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Catalog.module.css';
import {
  foodFromEntry,
  foodKey,
  PER_100,
  periodReading,
  toUpdate,
  type FoodDraft,
} from './catalog-draft';
import { NutrientGrid } from './NutrientGrid';
import { NUTRIENTS } from './nutrients';

const PERIOD_LABEL: Record<CatalogRange, string> = {
  day: 'aujourd’hui',
  week: 'cette semaine',
  month: 'ce mois-ci',
  quarter: 'ce trimestre',
};

export function FoodSheet({
  entry,
  onClose,
  onSaved,
  onCatalogue,
}: {
  entry: CatalogEntry | null;
  onClose: () => void;
  onSaved: () => void;
  /** « L'ajouter au catalogue » — la suite qu'un aliment hors catalogue promet. */
  onCatalogue?: ((name: string) => void) | undefined;
}) {
  const client = useQueryClient();
  const { notify } = useToast();
  const [draft, setDraft] = useState<FoodDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const foodId = entry === null ? '' : foodKey(entry);

  const { data, isPending } = useQuery({
    queryKey: keys.nutrition.food(foodId),
    queryFn: () => nutritionApi.food(foodId),
    enabled: entry !== null,
  });

  const save = useMutation({
    mutationFn: (values: FoodDraft) => {
      if (entry === null) throw new Error('aucun aliment ouvert');
      return nutritionApi.updateIngredient(entry.id, entry.token, toUpdate(values));
    },
    onSuccess: (saved) => {
      setError(null);
      setDraft(null);
      void client.invalidateQueries({ queryKey: keys.nutrition.all() });
      notify(`${saved.name} · corrigé`);
      onSaved();
    },
    onError: (failure: unknown) => {
      setError(failure instanceof ApiError ? failure.message : 'La correction n’a pas abouti.');
    },
  });

  const release = useMutation({
    mutationFn: () => {
      if (entry === null) throw new Error('aucun aliment ouvert');
      return nutritionApi.updateIngredient(entry.id, entry.token, { release: true });
    },
    onSuccess: () => {
      setError(null);
      void client.invalidateQueries({ queryKey: keys.nutrition.all() });
      notify('Le prochain scan reprendra la main.');
      onSaved();
    },
    onError: (failure: unknown) => {
      setError(failure instanceof ApiError ? failure.message : 'La demande n’a pas abouti.');
    },
  });

  if (entry === null) {
    return <Sheet open={false} onClose={onClose} title="Aliment" children={null} />;
  }

  const shown = data?.entry ?? entry;

  return (
    <Sheet open onClose={onClose} title={entry.name}>
      {draft !== null ? (
        <div className={styles.form}>
          <Field
            label="Nom"
            value={draft.name}
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value });
            }}
          />

          {/* Les cinq valeurs **pour 100 g**, dans l'ordre de `NUTRIENTS` — la seule liste
              du dépôt, pour qu'aucune ne s'oublie sur une surface de plus. La mention est
              en tête et non dans chaque étiquette : suffixée, elle les faisait passer à la
              ligne et la grille montait en escalier. */}
          <span className={styles.head}>pour 100 g</span>

          <div className={styles.formGrid}>
            {NUTRIENTS.map((nutrient) => (
              <Field
                key={nutrient.key}
                label={nutrient.field}
                inputMode={nutrient.inputMode}
                value={draft[PER_100[nutrient.key]]}
                onChange={(event) => {
                  setDraft({ ...draft, [PER_100[nutrient.key]]: event.target.value });
                }}
              />
            ))}
            <Field
              label="Portion (g)"
              inputMode="decimal"
              hint="Le poids habituel, proposé d’un appui sous le poids d’un plat."
              value={draft.portion_g}
              onChange={(event) => {
                setDraft({ ...draft, portion_g: event.target.value });
              }}
            />
          </div>

          {error !== null && <p className={styles.error}>{error}</p>}

          <p className={styles.note}>
            Une correction tient : ce que tu écris ici ne sera plus remplacé par un scan.
          </p>

          <div className={styles.actions}>
            <Button
              busy={save.isPending}
              onClick={() => {
                save.mutate(draft);
              }}
            >
              Enregistrer
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.detail}>
          {shown.barcode !== '' && <span className={styles.source}>{shown.barcode}</span>}

          <span className={styles.head}>pour 100 g</span>
          <NutrientGrid
            values={{
              protein_g: shown.protein_100g,
              added_sugar_g: shown.added_sugar_100g,
              calories: shown.calories_100g,
              saturated_fat_g: shown.saturated_fat_100g,
              fiber_g: shown.fiber_100g,
            }}
          />

          {shown.portion_g !== null && (
            <p className={styles.note}>Portion habituelle · {num(shown.portion_g, 0)} g</p>
          )}

          <span className={styles.head}>ce que tu en as mangé</span>
          {isPending ? (
            <Skeleton lines={2} />
          ) : (
            <>
              <dl className={styles.periods}>
                {(data?.periods ?? []).map((period) => (
                  <div key={period.range} className={styles.period}>
                    <dt>{PERIOD_LABEL[period.range]}</dt>
                    <dd>{periodReading(period)}</dd>
                  </div>
                ))}
              </dl>

              {/* D'où sortent ces grammes. Absent quand l'aliment n'a jamais été pesé —
                  une liste vide sous un titre se lirait comme une panne. Le titre a été
                  ajouté après coup : sans lui, quatre dates alignées sous les plages ne
                  disaient pas de quoi elles parlaient. */}
              {(data?.recent ?? []).length > 0 && (
                <>
                  <span className={styles.head}>derniers repas</span>
                  <ul className={styles.recent}>
                    {(data?.recent ?? []).map((line, index) => (
                      <li key={`${line.date}-${String(index)}`}>
                        <span>{dayMonth(line.date)}</span>
                        <span>{num(line.quantity_g, 0)} g</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {error !== null && <p className={styles.error}>{error}</p>}

          {shown.catalogued ? (
            <>
              {shown.edited_on !== null && (
                <p className={styles.note}>
                  Corrigé à la main le {dayMonth(shown.edited_on)} · un scan ne remplacera plus ces
                  valeurs.
                </p>
              )}
              <div className={styles.actions}>
                <Button
                  onClick={() => {
                    setDraft(foodFromEntry(shown));
                  }}
                >
                  Corriger
                </Button>
                {shown.edited_on !== null && (
                  <Button
                    variant="quiet"
                    busy={release.isPending}
                    onClick={() => {
                      release.mutate();
                    }}
                  >
                    Reprendre les valeurs de la base
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className={styles.note}>
                Cet aliment n’est pas au catalogue : il a été mangé, mais rien ne dit ce qu’il
                apporte. Il ne compte donc dans aucun total.
              </p>
              {onCatalogue !== undefined && (
                <div className={styles.actions}>
                  <Button
                    onClick={() => {
                      onCatalogue(shown.name);
                    }}
                  >
                    L’ajouter au catalogue
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
