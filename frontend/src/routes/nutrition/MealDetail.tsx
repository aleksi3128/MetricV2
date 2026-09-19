/**
 * La fiche d'un repas : ce qu'il apporte, et sa correction (`NUT-15`).
 *
 * Un repas enregistré ne se corrigeait pas depuis l'écran. Le `PATCH` existait depuis
 * `NUT-09`, mais un seul geste s'en servait — accepter l'estimation d'une photo rangée.
 * Une calorie mal tapée demandait de supprimer le repas et de le ressaisir, ce qui perdait
 * sa photo et son heure.
 *
 * ## Deux étapes, une feuille
 *
 * **Lire**, puis **corriger** : la même raison que la fiche d'un aliment et le scan
 * (`ScanStep.tsx`) — une feuille ouverte sur une autre n'a qu'une poignée pour deux
 * surfaces, et on ne sait plus laquelle on referme.
 *
 * ## Ce que la fiche montre après une correction
 *
 * **La ligne rendue par le serveur**, pas ce que le formulaire contenait. C'est ce qui a
 * été écrit — arrondis et préservations compris — et c'est le seul moyen de tenir le
 * nouveau jeton sans relire tout le journal : une seconde correction dans la foulée
 * partirait sinon avec l'ancien, et se ferait refuser.
 *
 * ## Mettre un repas en favori (`NUT-17`)
 *
 * Un repas du journal qu'on remange devait être **retapé** dans la carte des favoris — qui
 * s'appelait alors « Repas récurrents » : un nom et cinq nombres qu'on avait déjà sous les
 * yeux. La fiche l'y fait entrer d'un appui, par la route qui crée déjà un favori — les
 * valeurs envoyées sont celles que la fiche affiche, c'est-à-dire la ligne telle que le
 * serveur l'a rendue.
 *
 * **Sans confirmation** : c'est une addition, et elle se défait par « retirer » dans la
 * carte. **Le nom est la description** : un repas qui n'en a pas ne peut pas devenir
 * favori, et la fiche le dit plutôt que d'en inventer un.
 *
 * ## Ce qui ne se corrige pas ici
 *
 * **L'heure.** Le serveur l'accepterait, mais la composer à l'écran — le jour de la ligne,
 * l'heure du champ, le décalage du fuseau — est le calcul de date que le projet interdit
 * au client. **La photo** non plus : le service la préserve, et en changer demanderait un
 * envoi multipart qu'une correction n'a pas.
 */

import { useMutation } from '@tanstack/react-query';
import { useId, useLayoutEffect, useRef, useState } from 'react';

import { Badge, Button, Field, Sheet, Stepper } from '@/components/ui';
import { IconStar } from '@/components/ui/icons';
import { nutritionApi, type Favorite, type Meal, type MealUpdate } from '@/features/nutrition/api';
import { usePhoto } from '@/features/nutrition/usePhoto';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { time } from '@/lib/format';
import { useToast } from '@/lib/toast';

import styles from '../Nutrition.module.css';
import {
  correctionFrom,
  correctionPayload,
  unreadable,
  type CorrectionValues,
} from './meal-correction';
import { NutrientGrid } from './NutrientGrid';
import { NUTRIENTS } from './nutrients';

/**
 * Remet le contenu de la feuille en haut.
 *
 * « Corriger » est au bas de la lecture : on y arrive en faisant défiler. Le formulaire
 * s'ouvrait alors à la même hauteur, le champ « Type » au-dessus du bord — une étape qui
 * commence au milieu. Vu à 402 px après avoir fait défiler la fiche, pas dans un test.
 *
 * Le conteneur qui défile est cherché en remontant, plutôt que nommé : il appartient à
 * `Sheet`, et cette fiche n'a pas à connaître sa structure.
 */
function scrollSheetTop(node: HTMLElement | null): void {
  for (let parent = node?.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      // `scrollTop` et non `scrollTo({ behavior })` : `base.css` ne pose `smooth` que sur
      // la racine, et ce conteneur saute donc en place sans glisser — ce qu'on veut d'une
      // étape qui commence.
      parent.scrollTop = 0;
      return;
    }
  }
}

/** La photo en grand, ou sa place réservée pendant qu'elle arrive. */
function Photo({ meal }: { meal: Meal }) {
  const url = usePhoto(meal.photo);
  if (meal.photo === null) return null;
  // La place est tenue pendant le chargement : sans elle, la photo pousserait les valeurs
  // vers le bas une fois arrivée, sous le doigt qui visait « Corriger ».
  if (url === null) return <div className={styles.mealPhoto} aria-hidden="true" />;
  return <img className={styles.mealPhoto} src={url} alt={meal.comment ?? 'Photo du repas'} />;
}

/**
 * « Ajouter aux favoris » — ou pourquoi ce n'est pas possible, ou que c'est déjà fait.
 *
 * « Déjà » se lit sur le **nom**, exactement : deux favoris du même nom seraient deux
 * boutons « rejouer » indiscernables dans la carte. Une variante — même plat, autre
 * portion — se distingue en corrigeant d'abord sa description.
 */
function MakeRecurring({
  meal,
  favorites,
  onAdded,
}: {
  meal: Meal;
  favorites: readonly Favorite[];
  onAdded: () => void;
}) {
  const { notify } = useToast();
  const name = meal.comment?.trim() ?? '';
  const [error, setError] = useState<ApiError | null>(null);

  const add = useMutation({
    mutationFn: () =>
      nutritionApi.addFavorite({
        name,
        protein_g: meal.protein_g,
        added_sugar_g: meal.added_sugar_g,
        calories: meal.calories,
        saturated_fat_g: meal.saturated_fat_g,
        fiber_g: meal.fiber_g,
      }),
    onSuccess: () => {
      setError(null);
      // La photo ne suit pas : un favori se rejoue sans image, et le dire évite de la
      // chercher au journal du lendemain.
      notify(
        meal.photo === null
          ? `« ${name} » ajouté aux favoris.`
          : `« ${name} » ajouté aux favoris, sans sa photo.`,
        'signal',
      );
      onAdded();
    },
    onError: (caught: unknown) => {
      if (caught instanceof ApiError) {
        setError(caught);
        return;
      }
      notify(caught instanceof Error ? caught.message : 'Ajout impossible.', 'recover');
    },
  });

  if (name === '') {
    return (
      <p className={styles.empty}>
        Sans description, ce repas n’a pas de nom à donner à un favori. « Corriger » en ajoute une.
      </p>
    );
  }

  // Déjà là : relu dans la liste, ou confirmé par le `201` qui vient d'arriver. Le second
  // compte — entre la réponse et la liste relue, le bouton redevenait actif, et un second
  // appui y faisait un doublon.
  if (add.isSuccess || favorites.some((favorite) => favorite.name.trim() === name)) {
    return (
      <p className={cx(styles.empty, styles.favorited)}>
        <IconStar size={16} filled />
        Dans les favoris — il se rejoue depuis leur carte.
      </p>
    );
  }

  return (
    <>
      {error !== null && (
        <p className={styles.error} role="alert">
          {error.messageFor('name') === undefined
            ? error.message
            : `${error.message} Le nom d’un favori est plus court qu’une description : raccourcis-la avec « Corriger ».`}
        </p>
      )}
      <Button
        variant="ghost"
        busy={add.isPending}
        onClick={() => {
          add.mutate();
        }}
      >
        <span className={styles.favoriteAdd}>
          <IconStar size={18} />
          Ajouter aux favoris
        </span>
      </Button>
    </>
  );
}

function Reading({
  meal,
  favorites,
  onEdit,
  onClose,
  onFavorited,
}: {
  meal: Meal;
  favorites: readonly Favorite[];
  onEdit: () => void;
  onClose: () => void;
  onFavorited: () => void;
}) {
  const known = NUTRIENTS.some(({ key }) => meal[key] !== null);

  return (
    <div className={styles.detail}>
      <Photo meal={meal} />

      <div className={styles.mealHead}>
        <Badge tone="signal">{meal.meal_type}</Badge>
        {meal.source !== 'manual' && <Badge tone="load">{meal.source}</Badge>}
      </div>
      {meal.comment !== null && <p className={styles.mealComment}>{meal.comment}</p>}

      {known ? (
        <div className={styles.detailValues}>
          <span className={styles.detailValuesHead}>pour ce repas</span>
          <NutrientGrid values={meal} />
        </div>
      ) : (
        // Cinq tirets ne diraient rien de plus qu'une phrase, et la phrase dit le geste.
        <p className={styles.note}>
          Aucune valeur relevée pour ce repas. Elles s’ajoutent en le corrigeant.
        </p>
      )}

      <MakeRecurring meal={meal} favorites={favorites} onAdded={onFavorited} />

      <div className={styles.sheetCommit}>
        <Button variant="primary" className={styles.commit} onClick={onEdit}>
          Corriger
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  );
}

function Correction({
  meal,
  types,
  onBack,
  onSaved,
  onConflict,
}: {
  meal: Meal;
  types: readonly string[];
  onBack: () => void;
  onSaved: (updated: Meal) => void;
  onConflict: () => void;
}) {
  const { notify } = useToast();
  const typeId = useId();
  // Initialisé une fois, depuis la ligne qu'on vient de lire : la fiche est démontée à la
  // sortie de cette étape, et une nouvelle correction repart de la ligne à jour.
  const [values, setValues] = useState<CorrectionValues>(() => correctionFrom(meal));
  const [error, setError] = useState<ApiError | null>(null);

  const save = useMutation({
    mutationFn: (payload: MealUpdate) => nutritionApi.update(meal.id, meal.token, payload),
    onSuccess: (updated) => {
      notify('Repas corrigé.', 'effort');
      onSaved(updated);
    },
    onError: (caught: unknown) => {
      if (!(caught instanceof ApiError)) {
        notify(caught instanceof Error ? caught.message : 'Correction impossible.', 'recover');
        return;
      }
      setError(caught);
      // La ligne a changé ailleurs : le journal se relit, et la correction ne se force
      // pas (`STO-05`). Le message du serveur dit de recharger — rouvrir la fiche le fait.
      if (caught.code === 'conflict') onConflict();
    },
  });

  const blocked = unreadable(values);
  // La règle de la création, tenue à la correction : sans photo, un repas sans
  // description n'a plus rien pour le reconnaître au journal.
  const faceless = meal.photo === null && values.comment.trim() === '';
  // Un type que la liste ne connaît plus — écrit au tableur — reste proposé plutôt que
  // d'être remplacé en silence par le premier de la liste.
  const options = types.includes(values.meal_type) ? types : [values.meal_type, ...types];

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const payload = correctionPayload(values);
        if (payload !== null) save.mutate(payload);
      }}
      noValidate
    >
      {error !== null && (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )}

      <div className={styles.field}>
        <label htmlFor={typeId}>Type</label>
        <select
          id={typeId}
          className={styles.select}
          value={values.meal_type}
          onChange={(event) => {
            setValues((current) => ({ ...current, meal_type: event.target.value }));
          }}
        >
          {options.map((type) => (
            <option value={type} key={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <Field
        label="Description"
        value={values.comment}
        error={error?.messageFor('comment')}
        onChange={(event) => {
          setValues((current) => ({ ...current, comment: event.target.value }));
        }}
      />

      <div className={styles.triple}>
        {NUTRIENTS.map((nutrient) => (
          <Stepper
            key={nutrient.key}
            label={nutrient.field}
            inputMode={nutrient.inputMode}
            value={values[nutrient.key]}
            onChange={(value) => {
              setValues((current) => ({ ...current, [nutrient.key]: value }));
            }}
            step={nutrient.step}
            min={0}
            error={
              blocked.includes(nutrient.key)
                ? nutrient.inputMode === 'numeric'
                  ? 'Un nombre entier, ou rien.'
                  : 'Un nombre, ou rien.'
                : error?.messageFor(nutrient.key)
            }
          />
        ))}
      </div>

      <div className={styles.sheetCommit}>
        <Button
          type="submit"
          variant="primary"
          className={styles.commit}
          busy={save.isPending}
          disabled={blocked.length > 0 || faceless}
        >
          Enregistrer la correction
        </Button>
        {/* Rien n'est écrit : revenir à la lecture abandonne la saisie, sans confirmation. */}
        <Button variant="quiet" disabled={save.isPending} onClick={onBack}>
          Retour
        </Button>
      </div>

      {faceless && <p className={styles.empty}>Sans photo, un repas a besoin d’une description.</p>}
    </form>
  );
}

export function MealDetail({
  meal,
  types,
  favorites,
  onClose,
  onSaved,
  onConflict,
  onFavorited,
}: {
  /** Le repas ouvert, ou `null` — la feuille est alors fermée. */
  meal: Meal | null;
  types: readonly string[];
  /** Les favoris relus avec le jour, pour dire qu'un repas y est déjà. */
  favorites: readonly Favorite[];
  /** Un favori a été ajouté : la liste se relit. */
  onFavorited: () => void;
  onClose: () => void;
  /** La ligne que le serveur a rendue : c'est elle que la fiche montre ensuite. */
  onSaved: (updated: Meal) => void;
  onConflict: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const step = useRef<HTMLDivElement>(null);

  // Avant la peinture : un effet ordinaire montrerait une image à l'ancienne position.
  useLayoutEffect(() => {
    scrollSheetTop(step.current);
  }, [editing]);

  return (
    <Sheet
      open={meal !== null}
      onClose={onClose}
      title={meal === null ? '' : editing ? 'Corriger le repas' : `Repas de ${time(meal.datetime)}`}
      lede={
        editing
          ? 'La photo et la provenance restent. Rien n’est écrit avant ta validation.'
          : undefined
      }
    >
      <div ref={step}>
        {meal !== null &&
          (editing ? (
            <Correction
              meal={meal}
              types={types}
              onBack={() => {
                setEditing(false);
              }}
              onSaved={(updated) => {
                setEditing(false);
                onSaved(updated);
              }}
              onConflict={onConflict}
            />
          ) : (
            <Reading
              meal={meal}
              favorites={favorites}
              onEdit={() => {
                setEditing(true);
              }}
              onClose={onClose}
              onFavorited={onFavorited}
            />
          ))}
      </div>
    </Sheet>
  );
}
