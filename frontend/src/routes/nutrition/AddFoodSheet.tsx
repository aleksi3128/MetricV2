/**
 * Ajouter un aliment au catalogue, sans l'avoir mangé (`NUT-20`).
 *
 * Jusqu'ici le catalogue ne s'alimentait qu'en **sous-produit** d'un repas composé : un
 * aliment devait être mangé une fois pour être connu, et c'est la première fois — cinq
 * champs à remplir devant l'assiette — qui décourageait. Le code-barres l'avait déjà
 * allégée ; cette feuille permet de la faire à un autre moment, en rangeant ses courses
 * plutôt qu'en mangeant.
 *
 * ## Deux portes, dans le même ordre qu'ailleurs
 *
 * Le scan d'abord — il remplit le nom et les cinq valeurs —, la saisie à la main en
 * dessous, pour ce qui n'a pas de code-barres : le riz en vrac, les œufs, les légumes du
 * marché. C'est exactement la répartition de `IngredientTable`, et `ScanStep` est réemployé
 * tel quel : un second vocabulaire pour scanner serait un vocabulaire de trop.
 *
 * ## Une entrée sans aucune valeur est refusée
 *
 * Le catalogue existe pour remplir des champs. Une entrée qui n'en remplit aucun
 * apparaîtrait dans les suggestions du repas composé, serait choisie, et ne compterait pas
 * dans le total. Le serveur la refuse ; l'écran désactive le bouton plutôt que de laisser
 * partir une requête dont il connaît déjà la réponse.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Field, Sheet } from '@/components/ui';
import { nutritionApi } from '@/features/nutrition/api';
import { ApiError } from '@/lib/api';

import styles from './Catalog.module.css';
import {
  emptyFood,
  foodFromProduct,
  hasAnyValue,
  PER_100,
  toPayload,
  type FoodDraft,
} from './catalog-draft';
import { NUTRIENTS } from './nutrients';
import { ScanStep } from './ScanStep';

export function AddFoodSheet({
  open,
  name = '',
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Nom prérempli, quand la feuille est ouverte depuis un aliment déjà mangé. */
  name?: string | undefined;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  // Rouvrir la feuille repart d'une saisie propre : l'appelant la remonte par sa `key`,
  // comme la fiche d'un repas. Un effet qui remettrait l'état à zéro à l'ouverture serait
  // un rendu en cascade — et le dépôt le refuse en lint.
  const [draft, setDraft] = useState<FoodDraft>(() => emptyFood(name));
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (values: FoodDraft) => nutritionApi.addIngredient(toPayload(values)),
    onSuccess: (saved) => {
      onSaved(saved.name);
    },
    onError: (failure: unknown) => {
      setError(failure instanceof ApiError ? failure.message : 'L’ajout n’a pas abouti.');
    },
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ajouter un aliment"
      lede="Il sera proposé dans « repas composé », avec ses valeurs."
    >
      {scanning ? (
        <ScanStep
          onBack={() => {
            setScanning(false);
          }}
          onFound={(product) => {
            setDraft(foodFromProduct(product));
            setScanning(false);
          }}
          onManual={() => {
            setScanning(false);
          }}
        />
      ) : (
        <div className={styles.form}>
          <Button
            variant="ghost"
            onClick={() => {
              setScanning(true);
            }}
          >
            Scanner un code-barres
          </Button>

          <Field
            label="Nom"
            placeholder="riz basmati"
            value={draft.name}
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value });
            }}
          />

          {/* **« pour 100 g » en tête, et non dans chaque étiquette.** Suffixée à chaque
              champ, la mention faisait passer « Protéines (g) / 100 g » à la ligne : les
              étiquettes de la colonne de gauche prenaient deux lignes, celles de droite
              une seule, et les champs d'une même rangée ne s'alignaient plus. Vu en
              capture — aucune mesure de cible ne voit une grille en escalier. */}
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
              hint="Le poids habituel. Facultatif."
              value={draft.portion_g}
              onChange={(event) => {
                setDraft({ ...draft, portion_g: event.target.value });
              }}
            />
          </div>

          {error !== null && <p className={styles.error}>{error}</p>}

          {/* Ce que le bouton attend, écrit plutôt que deviné : un bouton inerte sans
              explication se lit comme une panne. */}
          {!hasAnyValue(draft) && (
            <p className={styles.note}>
              Un nom et au moins une valeur pour 100 g : sans elles, l’aliment serait proposé dans
              un plat sans rien y apporter.
            </p>
          )}

          <div className={styles.actions}>
            <Button
              busy={save.isPending}
              disabled={!hasAnyValue(draft)}
              onClick={() => {
                save.mutate(draft);
              }}
            >
              Ajouter au catalogue
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
