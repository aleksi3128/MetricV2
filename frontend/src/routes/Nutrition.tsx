/**
 * Écran Nutrition — les repas du jour, leurs totaux, et de quoi en ajouter un.
 *
 * **Le formulaire a quitté la page.** Il était déplié en permanence sous le journal :
 * un type, une photo, une description et trois pas-à-pas, qu'on vienne photographier son
 * assiette ou taper trois nombres. Il vit maintenant dans une feuille qui demande d'abord
 * **comment** on veut noter — [MealSheet](./nutrition/MealSheet.tsx).
 *
 * Ce qui reste ici se lit : les totaux, le journal, et les favoris.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import {
  AiBlock,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  LinkButton,
  PageHead,
  Ring,
  Rule,
  Skeleton,
  Stat,
} from '@/components/ui';
import { IconStar } from '@/components/ui/icons';
import { useAiStatus } from '@/features/ai/useAiStatus';
import {
  nutritionApi,
  type Favorite,
  type Meal,
  type MealEstimate,
} from '@/features/nutrition/api';
import { usePhoto } from '@/features/nutrition/usePhoto';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { integer, longDate, num, plural, time } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Nutrition.module.css';
import { estimateSentence } from './nutrition/estimate';
import { History } from './nutrition/History';
import { MealDetail } from './nutrition/MealDetail';
import { MealSheet } from './nutrition/MealSheet';

function useInvalidateNutrition() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.nutrition.all() });
    for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
  };
}

// ── Vignette ──────────────────────────────────────────

function Thumbnail({ meal }: { meal: Meal }) {
  const url = usePhoto(meal.photo);

  // Des `span` et non des `div` : la vignette vit dans la cible qui ouvre la fiche, et un
  // bouton n'admet que du contenu de phrase.
  if (meal.photo === null) return <span className={styles.thumbEmpty} aria-hidden="true" />;
  if (url === null) return <span className={styles.thumbEmpty} aria-hidden="true" />;
  // `alt` vide : le nom de la cible dit déjà de quel repas il s'agit, et la description
  // est lue avec lui.
  return <img className={styles.thumb} src={url} alt="" />;
}

// ── Une ligne du journal ──────────────────────────────

/**
 * Un repas déjà enregistré, et la porte de rattrapage que l'écran promet.
 *
 * « Une photo suffit, les chiffres peuvent venir après » : sans cette porte, « après »
 * n'existerait que pour les repas dont on a encore le fichier d'origine sous la main.
 * L'estimation ne modifie rien par elle-même — elle propose, et c'est un second appui qui
 * écrit, sous garde de jeton comme toute correction (`STO-05`).
 *
 * **Le corps de la ligne ouvre la fiche du repas** (`NUT-15`) — ce qu'il apporte, et sa
 * correction. La ligne, elle, garde ses trois valeurs : les cinq y feraient deux lignes par
 * repas dans 390 px.
 *
 * **« supprimer » demande deux appuis.** Il partait au premier, seule destruction de
 * l'écran à ne pas suivre la règle — les favoris, plus bas, l'appliquaient déjà.
 * Le motif est le leur, repris tel quel.
 */
function MealCard({
  meal,
  onOpen,
  onRemove,
  armed,
  removing,
}: {
  meal: Meal;
  onOpen: () => void;
  /** Premier appui : arme. Second : supprime. L'écran tient l'état, la ligne le montre. */
  onRemove: () => void;
  armed: boolean;
  removing: boolean;
}) {
  const bodyId = useId();
  const invalidate = useInvalidateNutrition();
  const { notify } = useToast();
  const ai = useAiStatus();
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);

  const suggest = useMutation({
    mutationFn: () => nutritionApi.analyzeMeal(meal.id),
    onSuccess: setEstimate,
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Estimation impossible.', 'recover');
    },
  });

  const apply = useMutation({
    mutationFn: (result: MealEstimate) =>
      nutritionApi.update(meal.id, meal.token, {
        meal_type: meal.meal_type,
        comment: meal.comment ?? result.comment,
        protein_g: result.protein_g,
        added_sugar_g: result.added_sugar_g,
        calories: result.calories,
        // Seulement si le modèle les a chiffrées : absentes, le serveur garde celles qui
        // étaient rangées — des fibres notées à la main ne s'effacent pas faute d'estimation.
        ...(result.saturated_fat_g !== null && { saturated_fat_g: result.saturated_fat_g }),
        ...(result.fiber_g !== null && { fiber_g: result.fiber_g }),
        // La provenance change réellement : ces macros n'ont pas été relevées.
        source: 'ai',
      }),
    onSuccess: () => {
      invalidate();
      setEstimate(null);
      notify('Estimation enregistrée. Elle se corrige comme une saisie.', 'effort');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Enregistrement impossible.', 'recover');
    },
  });

  // Un repas sans photo n'a rien à faire analyser, et un repas déjà chiffré n'a rien à
  // gagner à l'être : la proposition ne s'affiche que là où elle apporte quelque chose.
  const estimable = ai.enabled && meal.photo !== null && meal.protein_g === null;

  return (
    <div className={styles.meal}>
      {/* Le nom accessible annonce l'action, comme « Fiche de Nutella » dans un plat ; le
          contenu de la ligne est lu en description, pour ne rien perdre de ce qu'on voit. */}
      <button
        type="button"
        className={styles.mealOpen}
        aria-label={`Fiche du repas de ${time(meal.datetime)}`}
        aria-describedby={bodyId}
        onClick={onOpen}
      >
        <Thumbnail meal={meal} />
        <span className={styles.mealBody} id={bodyId}>
          <span className={styles.mealHead}>
            <span className={styles.mealTime}>{time(meal.datetime)}</span>
            <Badge tone="signal">{meal.meal_type}</Badge>
            {meal.source !== 'manual' && <Badge tone="load">{meal.source}</Badge>}
          </span>
          {meal.comment !== null && <span className={styles.mealComment}>{meal.comment}</span>}
          <span className={styles.mealMacros}>
            {meal.protein_g !== null
              ? `${num(meal.protein_g, 0)} g prot.`
              : 'macros non renseignées'}
            {meal.added_sugar_g !== null && ` · ${num(meal.added_sugar_g, 0)} g sucres`}
            {meal.calories !== null && ` · ${integer(meal.calories)} kcal`}
          </span>
        </span>
        <span className={styles.foodChevron} aria-hidden="true" />
      </button>

      {/* **Sous le texte, et non à côté.** La colonne « supprimer » prenait 85 px sur la
          largeur du repas : la flèche flottait au milieu de la carte, détachée du bord, et
          la description passait sur deux ou trois lignes. Sur sa propre ligne, l'action
          rend la largeur au texte, et la carte y gagne en hauteur plus qu'elle n'en perd. */}
      <div className={styles.mealActions}>
        {estimable && estimate === null && (
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Estimer les macros du repas de ${time(meal.datetime)}`}
            disabled={suggest.isPending}
            onClick={() => {
              suggest.mutate();
            }}
          >
            {suggest.isPending ? '…' : 'estimer'}
          </button>
        )}
        <button
          type="button"
          className={cx(styles.iconButton, styles.danger, armed && styles.armed)}
          aria-label={
            armed
              ? `Supprimer le repas de ${time(meal.datetime)} — confirmer`
              : `Supprimer le repas de ${time(meal.datetime)}`
          }
          disabled={removing}
          onClick={onRemove}
        >
          {armed ? 'confirmer ?' : 'supprimer'}
        </button>
      </div>

      {estimate !== null && (
        <div className={styles.mealEstimate}>
          <AiBlock
            tag="Estimation"
            actions={
              estimate.empty || !estimate.readable ? (
                <Button
                  variant="quiet"
                  onClick={() => {
                    setEstimate(null);
                  }}
                >
                  Fermer
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    busy={apply.isPending}
                    onClick={() => {
                      apply.mutate(estimate);
                    }}
                  >
                    Enregistrer ces valeurs
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setEstimate(null);
                    }}
                  >
                    Pas d&apos;accord
                  </Button>
                </>
              )
            }
          >
            {estimate.empty || !estimate.readable ? (
              <p>
                Rien n&apos;a pu être estimé sur cette photo. Le repas reste tel quel — les macros
                se saisissent à la main.
              </p>
            ) : (
              <p>
                Ce repas contiendrait <strong>{estimateSentence(estimate)}</strong>. Rien n&apos;est
                enregistré tant que tu n&apos;as pas validé.
              </p>
            )}
          </AiBlock>
        </div>
      )}
    </div>
  );
}

// ── Favoris ───────────────────────────────────────────

/**
 * Ce qui revient chaque jour, rejoué en une action.
 *
 * **Les sucres manquaient.** Le fichier les porte depuis toujours — `favorites.csv` a la
 * colonne, le schéma la valide, le service la relit —, mais la carte ne les demandait pas
 * et ne les affichait pas. Un repas récurrent enregistré ici arrivait donc au journal avec
 * ses protéines et ses calories, et un sucre à vide : le plafond quotidien comptait faux
 * pour tout ce qui se rejoue.
 */
function Favorites({ favorites }: { favorites: Favorite[] }) {
  const invalidate = useInvalidateNutrition();
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [protein, setProtein] = useState('');
  const [sugar, setSugar] = useState('');
  const [calories, setCalories] = useState('');
  const [saturatedFat, setSaturatedFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [armed, setArmed] = useState<number | null>(null);

  /** Un champ de texte vers le nombre que l'API attend, ou `null` s'il est vide. */
  function decimal(value: string): number | null {
    const cleaned = value.replace(',', '.').trim();
    if (cleaned === '') return null;
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const add = useMutation({
    mutationFn: () =>
      nutritionApi.addFavorite({
        name,
        protein_g: decimal(protein),
        added_sugar_g: decimal(sugar),
        calories: decimal(calories) === null ? null : Math.round(decimal(calories) ?? 0),
        saturated_fat_g: decimal(saturatedFat),
        fiber_g: decimal(fiber),
      }),
    onSuccess: () => {
      invalidate();
      notify('Repas favori enregistré.', 'signal');
      setName('');
      setProtein('');
      setSugar('');
      setCalories('');
      setSaturatedFat('');
      setFiber('');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Ajout impossible.', 'recover');
    },
  });

  const replay = useMutation({
    mutationFn: (favorite: Favorite) => nutritionApi.replayFavorite(favorite.favorite_id),
    onSuccess: (meal) => {
      invalidate();
      notify(`« ${meal.comment ?? 'Repas'} » ajouté au journal.`, 'effort');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Rejeu impossible.', 'recover');
    },
  });

  const remove = useMutation({
    mutationFn: (favorite: Favorite) => nutritionApi.removeFavorite(favorite.id, favorite.token),
    onSuccess: () => {
      setArmed(null);
      invalidate();
    },
    onError: (caught: unknown) => {
      setArmed(null);
      notify(caught instanceof ApiError ? caught.message : 'Retrait impossible.', 'recover');
    },
  });

  return (
    <Card>
      {/* « Favoris » et une étoile, là où la carte disait « Repas récurrents » et
          l'expliquait en deux lignes : l'étoile se lit sans légende, et c'est la même que
          celle de la fiche d'un repas. */}
      <h3 className={styles.favoritesTitle}>
        <IconStar size={18} filled />
        Favoris
      </h3>

      {favorites.length > 0 && (
        <div className={styles.favorites}>
          {favorites.map((favorite) => (
            <div className={styles.favorite} key={favorite.favorite_id}>
              <span>
                {favorite.name}
                <br />
                <span className={styles.favoriteMacros}>
                  {favorite.protein_g !== null ? `${num(favorite.protein_g, 0)} g prot.` : '—'}
                  {favorite.added_sugar_g !== null &&
                    ` · ${num(favorite.added_sugar_g, 0)} g sucres`}
                  {favorite.calories !== null && ` · ${integer(favorite.calories)} kcal`}
                </span>
              </span>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Rejouer ${favorite.name}`}
                onClick={() => {
                  replay.mutate(favorite);
                }}
              >
                rejouer
              </button>
              {/* Deux appuis pour détruire : le projet n'a pas d'annulation. Et un
                  libellé plutôt qu'un « ✕ » — le glyphe faisait une cible de 25 px de
                  large, et « retirer » dit ce qu'il fait. */}
              <button
                type="button"
                className={cx(
                  styles.iconButton,
                  styles.danger,
                  armed === favorite.id && styles.armed,
                )}
                aria-label={
                  armed === favorite.id
                    ? `Retirer ${favorite.name} — confirmer`
                    : `Retirer ${favorite.name}`
                }
                disabled={remove.isPending}
                onClick={() => {
                  if (armed !== favorite.id) {
                    setArmed(favorite.id);
                    return;
                  }
                  remove.mutate(favorite);
                }}
              >
                {armed === favorite.id ? 'confirmer ?' : 'retirer'}
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate();
        }}
        noValidate
      >
        <Field
          label="Nom"
          placeholder="Skyr + flocons"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {/* Les trois macros, au même rang. Les sucres n'étaient pas là, et le plafond
            quotidien comptait donc faux sur tout ce qui se rejoue. */}
        <div className={styles.triple}>
          <Field
            label="Protéines"
            inputMode="decimal"
            value={protein}
            onChange={(event) => {
              setProtein(event.target.value);
            }}
          />
          <Field
            label="Sucres"
            inputMode="decimal"
            value={sugar}
            onChange={(event) => {
              setSugar(event.target.value);
            }}
          />
          <Field
            label="Calories"
            inputMode="numeric"
            value={calories}
            onChange={(event) => {
              setCalories(event.target.value);
            }}
          />
          {/* `NUT-16` : sans elles, un repas rejoué arriverait au journal sans ses fibres —
              le défaut des sucres, une seconde fois. */}
          <Field
            label="AG saturés"
            inputMode="decimal"
            value={saturatedFat}
            onChange={(event) => {
              setSaturatedFat(event.target.value);
            }}
          />
          <Field
            label="Fibres"
            inputMode="decimal"
            value={fiber}
            onChange={(event) => {
              setFiber(event.target.value);
            }}
          />
        </div>
        <Button type="submit" variant="ghost" busy={add.isPending} disabled={name.trim() === ''}>
          Enregistrer en favori
        </Button>
      </form>
    </Card>
  );
}

/**
 * Sur combien de repas du jour une somme porte (`NUT-16`).
 *
 * Du vocabulaire et non un calcul : les deux nombres viennent du serveur, cette fonction
 * choisit la phrase. Même tournure que la tuile « Repas notés ».
 */
function coverage(known: number, meals: number): string {
  if (known === 0) return 'aucun repas chiffré';
  return known < meals
    ? `${String(known)} ${plural(known, 'chiffré')} sur ${String(meals)}`
    : 'tous chiffrés';
}

// ── Écran ─────────────────────────────────────────────

export function Nutrition() {
  const invalidate = useInvalidateNutrition();
  const { notify } = useToast();
  const [adding, setAdding] = useState(false);
  // Le repas dont la fiche est ouverte, tel que le serveur l'a rendu en dernier — au
  // journal, puis à la correction (`NUT-15`).
  const [inspected, setInspected] = useState<Meal | null>(null);
  // Le repas dont la suppression est armée. Un seul à la fois : armer une autre ligne
  // désarme la précédente, et une confirmation ne reste pas en attente ailleurs.
  const [armed, setArmed] = useState<number | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: keys.nutrition.all(),
    queryFn: () => nutritionApi.day(),
  });

  const remove = useMutation({
    mutationFn: (meal: Meal) => nutritionApi.remove(meal.id, meal.token),
    onSuccess: () => {
      setArmed(null);
      invalidate();
      notify('Repas supprimé. La photo reste sur Nextcloud.', 'signal');
    },
    onError: (caught: unknown) => {
      setArmed(null);
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
      invalidate();
    },
  });

  const totals = data?.totals;

  return (
    <div className={cx('wrap', styles.screen)}>
      {/* Le jour vient du serveur, dans le fuseau local. Cette ligne écrivait
          `longDate(new Date())` : l'horloge du téléphone, qui n'est pas celle qui a daté
          les repas. */}
      <PageHead
        eyebrow="Domaine Nutrition"
        title="Repas du jour"
        actions={
          <Button
            variant="primary"
            disabled={data === undefined}
            onClick={() => {
              setAdding(true);
            }}
          >
            Ajouter un repas
          </Button>
        }
      >
        {data !== undefined ? longDate(data.date) : '—'}
      </PageHead>

      {/* Les trois totaux d'une même journée disaient zéro de trois façons : « 0 % » dans
          l'anneau, « 0 g » pour les sucres, « — » pour les calories. Sans repas, il n'y a
          pas trois états — il n'y en a qu'un, et c'est le tiret.

          Les calories sont passées de la tuile à l'anneau le jour où elles ont eu un
          objectif. Un chiffre nu ne disait rien : « 2 340 kcal » ne se lit que contre une
          référence, et c'est la même que celle qui colore la grille plus bas. */}
      {/* **Rien plutôt qu'un cadre vide.** Sur panne, `totals` reste indéfini : les deux
          anneaux ne rendaient rien et laissaient deux rectangles muets, et les deux tuiles
          affichaient « — » avec « une photo suffit à en ouvrir un » — une invitation qui
          suppose une journée sans repas, alors que l'écran n'a rien pu lire. La section
          entière se tait ; la carte du journal, plus bas, nomme la panne. */}
      {error === null && (
        <>
          <Rule>Totaux</Rule>
          <div className="grid g2">
            <Card>
              {totals === undefined ? (
                <Skeleton lines={2} />
              ) : (
                <Ring
                  ratio={totals.meals > 0 ? totals.protein_ratio : null}
                  label="Protéines"
                  detail={
                    totals.meals > 0
                      ? `${num(totals.protein_g, 0)} g sur ${num(totals.protein_target_g, 0)} g`
                      : `objectif ${num(totals.protein_target_g, 0)} g`
                  }
                  tone={totals.protein_ratio >= 1 ? 'effort' : 'signal'}
                />
              )}
            </Card>
            <Card>
              {totals === undefined ? (
                <Skeleton lines={2} />
              ) : (
                <Ring
                  // Chiffré, pas noté : une journée de repas photographiés sans calories n'a
                  // pas d'anneau à 0 %, elle a un tiret.
                  ratio={totals.calories_known > 0 ? totals.calories_ratio : null}
                  label="Calories"
                  detail={
                    totals.calories_known > 0
                      ? `${integer(totals.calories)} sur ${integer(totals.calories_target)} kcal`
                      : `objectif ${integer(totals.calories_target)} kcal`
                  }
                  tone={totals.calories_ratio >= 1 ? 'load' : 'signal'}
                />
              )}
            </Card>
          </div>

          {/* Deux tuiles : un libellé, un chiffre, une ligne. Elles tiennent de front. */}
          <div className="grid tiles">
            <Card>
              <Stat
                compact
                label="Sucres ajoutés"
                value={totals && totals.meals > 0 ? num(totals.added_sugar_g, 0) : '—'}
                unit={totals && totals.meals > 0 ? 'g' : undefined}
                detail={
                  totals
                    ? totals.over_sugar
                      ? `plafond dépassé (${num(totals.added_sugar_max_g, 0)} g)`
                      : `plafond ${num(totals.added_sugar_max_g, 0)} g`
                    : undefined
                }
                direction={totals?.over_sugar === true ? 'down' : undefined}
              />
            </Card>
            <Card>
              <Stat
                compact
                label="Repas notés"
                value={totals && totals.meals > 0 ? integer(totals.meals) : '—'}
                unit={
                  totals && totals.meals > 0 ? plural(totals.meals, 'repas', 'repas') : undefined
                }
                detail={
                  totals && totals.meals > 0
                    ? totals.calories_known < totals.meals
                      ? `${totals.calories_known} ${plural(totals.calories_known, 'chiffré')} sur ${totals.meals}`
                      : 'tous chiffrés'
                    : 'une photo suffit à en ouvrir un'
                }
              />
            </Card>
            {/* `NUT-16`. Le chiffre ne s'affiche que s'il porte sur au moins un repas :
                les repas d'avant n'ont ni l'une ni l'autre valeur, et « 0 g de fibres »
                un jour de lentilles serait une mesure inventée. La ligne dit sur combien de
                repas la somme porte. Pas d'objectif : voir `docs/fiche-repas.md` §4. */}
            <Card>
              <Stat
                compact
                label="AG saturés"
                value={
                  totals && totals.saturated_fat_known > 0 ? num(totals.saturated_fat_g, 1) : '—'
                }
                unit={totals && totals.saturated_fat_known > 0 ? 'g' : undefined}
                detail={totals ? coverage(totals.saturated_fat_known, totals.meals) : undefined}
              />
            </Card>
            <Card>
              <Stat
                compact
                label="Fibres"
                value={totals && totals.fiber_known > 0 ? num(totals.fiber_g, 1) : '—'}
                unit={totals && totals.fiber_known > 0 ? 'g' : undefined}
                detail={totals ? coverage(totals.fiber_known, totals.meals) : undefined}
              />
            </Card>
          </div>
        </>
      )}
      <History />

      <Rule>Journal</Rule>
      <div className={styles.split}>
        <Card>
          {/* Quatre états, et non trois. Cette pile s'arrêtait à « chargement / repas /
              aucun repas » : sur `storage_unavailable` — la panne que ce projet voit le
              plus souvent — `isPending` retombait à faux, `data` restait indéfini, et
              l'écran affirmait « Aucun repas aujourd'hui ». Une panne de stockage se
              lisait comme un jeûne, ce qui est crédible et faux. */}
          {isPending ? (
            <Skeleton />
          ) : error ? (
            <Empty title="Journal indisponible">
              {error instanceof Error ? error.message : 'Le serveur n’a pas répondu.'}
            </Empty>
          ) : data && data.meals.length > 0 ? (
            data.meals.map((meal) => (
              <MealCard
                key={`${meal.id}-${meal.token}`}
                meal={meal}
                onOpen={() => {
                  setArmed(null);
                  setInspected(meal);
                }}
                armed={armed === meal.id}
                onRemove={() => {
                  if (armed !== meal.id) {
                    setArmed(meal.id);
                    return;
                  }
                  remove.mutate(meal);
                }}
                removing={remove.isPending}
              />
            ))
          ) : (
            <Empty title="Aucun repas aujourd'hui">
              Une photo suffit. Les chiffres peuvent venir après.
            </Empty>
          )}
        </Card>

        <Favorites favorites={data?.favorites ?? []} />
      </div>

      {/* La porte du catalogue (`NUT-19`). En bas, et c'est voulu : on vient ici pour
          noter un repas, pas pour tenir une liste d'aliments. Le catalogue se consulte
          quand la journée est notée, ou en rangeant ses courses. */}
      <div className={styles.catalogLink}>
        <LinkButton variant="ghost" to="/nutrition/catalogue">
          Catalogue alimentaire
        </LinkButton>
      </div>

      {data !== undefined && (
        <MealDetail
          // Une fiche par repas ouvert : rouvrir la fiche repart de la lecture, pas de la
          // correction laissée en plan sur une autre ligne.
          key={inspected?.id ?? 'fermee'}
          meal={inspected}
          types={data.types}
          favorites={data.favorites}
          onFavorited={invalidate}
          onClose={() => {
            setInspected(null);
          }}
          onSaved={(updated) => {
            setInspected(updated);
            invalidate();
          }}
          onConflict={invalidate}
        />
      )}

      {data !== undefined && (
        <MealSheet
          open={adding}
          suggested={data.suggested_type}
          types={data.types}
          ingredients={data.ingredients}
          onClose={() => {
            setAdding(false);
          }}
          onSaved={() => {
            setAdding(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}
