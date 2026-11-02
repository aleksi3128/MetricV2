/**
 * Écran Nutrition — les repas du jour, leurs totaux, et de quoi en ajouter un.
 *
 * **Le formulaire a quitté la page.** Il était déplié en permanence sous le journal :
 * un type, une photo, une description et trois pas-à-pas, qu'on vienne photographier son
 * assiette ou taper trois nombres. Il vit maintenant dans une feuille qui demande d'abord
 * **comment** on veut noter — [MealSheet](./nutrition/MealSheet.tsx).
 *
 * Ce qui reste ici se lit : les totaux, le journal, et les favoris.
 *
 * **Le journal et les totaux lisent aujourd'hui ou hier.** Depuis M-01, un repas se
 * rattrape la veille ; sans le journal d'hier, aucun écran n'ouvrait sa fiche, et un
 * rattrapage fait par erreur ne se corrigeait ni ne se supprimait. Les deux jours sont ceux
 * que le serveur sert (`days`) : l'écran choisit, il ne compose aucune date.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useSearchParams } from 'react-router';

import {
  Badge,
  Button,
  Card,
  Empty,
  LinkButton,
  PageHead,
  Ring,
  Rule,
  Segmented,
  Skeleton,
  Stat,
} from '@/components/ui';
import { IconStar } from '@/components/ui/icons';
import { nutritionApi, type Favorite, type Meal, type MealDay } from '@/features/nutrition/api';
import { usePhoto } from '@/features/nutrition/usePhoto';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { integer, longDate, num, plural } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Nutrition.module.css';
import { History } from './nutrition/History';
import { MealDetail } from './nutrition/MealDetail';
import { mealName, mealTime } from './nutrition/meal-moment';
import { MealSheet } from './nutrition/MealSheet';

function useInvalidateNutrition() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.nutrition.all() });
    // Le parcours du matin compte les repas d'hier : en rattraper un doit le lui dire (M-01).
    void client.invalidateQueries({ queryKey: keys.morning.flow() });
    for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
  };
}

// ── Vignette ──────────────────────────────────────────

function Thumbnail({ meal }: { meal: Meal }) {
  const url = usePhoto(meal.photo);

  // Des `span` et non des `div` : la vignette vit dans la cible qui ouvre la fiche, et un
  // bouton n'admet que du contenu de phrase.
  // Sans photo, rien : un carré gris vide sur chaque repas était le reliquat de la photo
  // retirée (`NUT-22`), et prenait 56 px à la description (audit du 17 octobre, fiche 31).
  // Le carré ne reste que le temps qu'une vraie photo arrive.
  if (meal.photo === null) return null;
  if (url === null) return <span className={styles.thumbEmpty} aria-hidden="true" />;
  // `alt` vide : le nom de la cible dit déjà de quel repas il s'agit, et la description
  // est lue avec lui.
  return <img className={styles.thumb} src={url} alt="" />;
}

// ── Une ligne du journal ──────────────────────────────

/**
 * Un repas déjà enregistré.
 *
 * **L'estimation depuis la photo rangée a été retirée** (`NUT-22`). Elle ne s'affichait
 * que sur un repas *photographié et non chiffré* : plus aucun repas nouveau ne remplit la
 * première condition, et une porte qui ne s'ouvre que sur le passé se lit comme une
 * fonctionnalité alors qu'elle n'en est plus une. Un repas ancien se corrige à sa fiche,
 * comme tous les autres.
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

  return (
    <div className={styles.meal}>
      {/* Le nom accessible annonce l'action, comme « Fiche de Nutella » dans un plat ; le
          contenu de la ligne est lu en description, pour ne rien perdre de ce qu'on voit. */}
      <button
        type="button"
        className={styles.mealOpen}
        aria-label={`Fiche du ${mealName(meal)}`}
        aria-describedby={bodyId}
        onClick={onOpen}
      >
        <Thumbnail meal={meal} />
        <span className={styles.mealBody} id={bodyId}>
          <span className={styles.mealHead}>
            <span className={styles.mealTime}>{mealTime(meal)}</span>
            <Badge tone="signal">{meal.meal_type}</Badge>
            {meal.source !== 'manual' && <Badge tone="load">{meal.source}</Badge>}
          </span>
          {meal.comment !== null && <span className={styles.mealComment}>{meal.comment}</span>}
          <span className={styles.mealMacros}>
            {/* Espaces insécables entre le nombre et son unité : « 640 / kcal » passait à
                la ligne entre les deux (fiche 31). */}
            {meal.protein_g !== null
              ? // Une décimale sous 10 g : 1,5 g de protéines s'affichait « 2 g » (fiche 33).
                `${num(meal.protein_g, meal.protein_g < 10 ? 1 : 0)}\u00a0g prot.`
              : 'macros non renseignées'}
            {meal.added_sugar_g !== null && ` · ${num(meal.added_sugar_g, 0)}\u00a0g sucres`}
            {meal.calories !== null && ` · ${integer(meal.calories)}\u00a0kcal`}
          </span>
        </span>
        <span className={styles.foodChevron} aria-hidden="true" />
      </button>

      {/* **Sous le texte, et non à côté.** La colonne « supprimer » prenait 85 px sur la
          largeur du repas : la flèche flottait au milieu de la carte, détachée du bord, et
          la description passait sur deux ou trois lignes. Sur sa propre ligne, l'action
          rend la largeur au texte, et la carte y gagne en hauteur plus qu'elle n'en perd. */}
      <div className={styles.mealActions}>
        <button
          type="button"
          className={cx(styles.iconButton, styles.danger, armed && styles.armed)}
          aria-label={
            armed ? `Supprimer le ${mealName(meal)} — confirmer` : `Supprimer le ${mealName(meal)}`
          }
          disabled={removing}
          onClick={onRemove}
        >
          {armed ? 'confirmer ?' : 'supprimer'}
        </button>
      </div>
    </div>
  );
}

// ── Favoris ───────────────────────────────────────

/**
 * Les favoris, à gérer : les relire, en retirer un.
 *
 * **Ils se rejouent dans la feuille d'ajout** (M-23), au jour choisi : un « rejouer » ici,
 * sous l'historique, était à 2 800 px du haut et datait toujours de l'instant.
 *
 * **Le formulaire de création est parti.** Il occupait la carte en permanence — un nom et
 * cinq nombres déjà connus du journal —, alors que la fiche d'un repas fait entrer un repas
 * aux favoris d'un appui. C'est la seule porte, et l'état vide la nomme. Un favori sans
 * description ne se crée donc plus à la main : c'était déjà la règle de la fiche.
 */
function Favorites({ favorites }: { favorites: Favorite[] }) {
  const invalidate = useInvalidateNutrition();
  const { notify } = useToast();
  const [armed, setArmed] = useState<number | null>(null);

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

      {favorites.length > 0 ? (
        <>
          {/* « d'un appui » n'est vrai que pour aujourd'hui : pour hier, la feuille demande
              d'abord le type. */}
          <p className={styles.note}>Ils s’ajoutent depuis « Ajouter un repas ».</p>
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
        </>
      ) : (
        <p className={styles.note}>
          Aucun favori. Un repas du journal y entre depuis sa fiche : « Ajouter aux favoris ».
        </p>
      )}
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
  /**
   * `?ajout=…` ouvre la feuille : `?ajout=hier` sur hier — l'adresse où mène « Aucun repas
   * noté hier » du parcours du matin (M-01) —, toute autre valeur sur le jour par défaut
   * — `?ajout=repas`, où mène « Ajouter un repas » de « Noter » (M-23). Même motif que
   * `/assistant?ouvre=…` : l'adresse ouvre, la fermeture la retire, sans quoi « précédent »
   * rouvrirait la feuille.
   *
   * « hier » se traduit en **date servie** par `days` ; l'écran ne la calcule pas.
   */
  const [params, setParams] = useSearchParams();
  const askedDay = params.get('ajout') === 'hier' ? 'yesterday' : null;
  /*
   * `?code=…` : le code-barres qu'aucune base ne connaît, porté depuis le scan de « Noter »
   * (`NUT-28`). La feuille s'ouvre sur une ligne à décrire qui le garde. Seuls des chiffres
   * passent — un code-barres n'est rien d'autre, et le serveur le revérifie à la lecture.
   */
  const askedCode = /^\d{8,14}$/.test(params.get('code') ?? '')
    ? (params.get('code') ?? undefined)
    : undefined;

  function openSheetOn(day: 'hier' | null): void {
    if (day === null) {
      setOpened(true);
      return;
    }
    // Par l'adresse, comme le lien du matin : c'est elle qui impose le jour à la feuille.
    const next = new URLSearchParams(params);
    next.set('ajout', day);
    setParams(next, { replace: true });
  }
  const [opened, setOpened] = useState(false);
  // Dérivé, pas recopié : le parcours du matin et « Noter » sont des feuilles globales, et
  // leur lien peut être suivi alors que cet écran est déjà monté — l'adresse change, l'état
  // non.
  const adding = opened || params.has('ajout');

  function closeSheet(): void {
    setOpened(false);
    if (!params.has('ajout') && !params.has('code')) return;
    const next = new URLSearchParams(params);
    next.delete('ajout');
    next.delete('code');
    setParams(next, { replace: true });
  }
  // Le repas dont la fiche est ouverte, tel que le serveur l'a rendu en dernier — au
  // journal, puis à la correction (`NUT-15`).
  const [inspected, setInspected] = useState<Meal | null>(null);
  // Le repas dont la suppression est armée. Un seul à la fois : armer une autre ligne
  // désarme la précédente, et une confirmation ne reste pas en attente ailleurs.
  const [armed, setArmed] = useState<number | null>(null);

  // La journée en cours : elle porte les jours servis, les favoris et tout ce que la feuille
  // et la fiche demandent — quel que soit le jour que le journal montre.
  const { data, isPending, error } = useQuery({
    queryKey: keys.nutrition.all(),
    queryFn: () => nutritionApi.day(),
  });

  /**
   * Le jour que le journal et les totaux lisent. Une **clé** et non une date : la date
   * vient de `days`, relue avec la journée — passé minuit, « hier » suit le serveur au lieu
   * de pointer un jour qui ne se sert plus. Rien ne se rabat en silence ici : on lit, on
   * n'écrit pas.
   */
  const [shownKey, setShownKey] = useState<MealDay['key']>('today');
  const shownDay =
    shownKey === 'today' ? undefined : data?.days.find((day) => day.key === shownKey);
  const past = useQuery({
    queryKey: keys.nutrition.meals(shownDay?.date ?? ''),
    queryFn: () => nutritionApi.day(shownDay?.date),
    enabled: shownDay !== undefined,
  });
  // Ce que montrent le journal et les totaux. Une requête par jour, et non une seule dont
  // on changerait la clé : la journée reste chargée pour l'en-tête, la feuille et la fiche,
  // et le segment ne disparaît pas le temps qu'hier arrive.
  const shown =
    shownDay === undefined
      ? { data, isPending, error }
      : { data: past.data, isPending: past.isPending, error: past.error };

  const remove = useMutation({
    mutationFn: (meal: Meal) => nutritionApi.remove(meal.id, meal.token),
    onSuccess: (_, meal) => {
      setArmed(null);
      invalidate();
      // La photo reste sur Nextcloud — quand il y en avait une. Le dire d'un repas saisi à
      // la main annonçait un fichier qui n'a jamais existé.
      notify(
        meal.photo !== null ? 'Repas supprimé. La photo reste sur Nextcloud.' : 'Repas supprimé.',
        'signal',
      );
    },
    onError: (caught: unknown) => {
      setArmed(null);
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
      invalidate();
    },
  });

  const totals = shown.data?.totals;

  return (
    <div className={cx('wrap', styles.screen)}>
      {/* Le jour vient du serveur, dans le fuseau local. Cette ligne écrivait
          `longDate(new Date())` : l'horloge du téléphone, qui n'est pas celle qui a daté
          les repas. */}
      <PageHead
        eyebrow="Domaine Nutrition"
        title={shownDay?.key === 'yesterday' ? 'Repas d’hier' : 'Repas du jour'}
        actions={
          <Button
            variant="primary"
            disabled={data === undefined}
            onClick={() => {
              // Devant le journal d'hier, on ajoute à hier : c'est le jour qu'on regarde.
              openSheetOn(shownDay?.key === 'yesterday' ? 'hier' : null);
            }}
          >
            Ajouter un repas
          </Button>
        }
      >
        {shownDay !== undefined
          ? longDate(shownDay.date)
          : data !== undefined
            ? longDate(data.date)
            : '—'}
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
      {shown.error === null && (
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
                      : `cible ${num(totals.protein_target_g, 0)} g`
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
                      : `cible ${integer(totals.calories_target)} kcal`
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
                    : 'une description suffit à en ouvrir un'
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
      {/* Au-dessus du journal : c'est lui qu'on vient relire. Le titre et les totaux
          suivent ; l'historique, qui a sa propre plage, ne bouge pas. */}
      {data !== undefined && data.days.length > 1 && (
        <Segmented
          options={data.days.map((day) => ({ value: day.key, label: day.label }))}
          value={shownKey}
          onChange={(key) => {
            setArmed(null);
            setShownKey(key);
          }}
          label="Jour du journal"
        />
      )}
      <div className={styles.split}>
        <Card>
          {/* Quatre états, et non trois. Cette pile s'arrêtait à « chargement / repas /
              aucun repas » : sur `storage_unavailable` — la panne que ce projet voit le
              plus souvent — `isPending` retombait à faux, `data` restait indéfini, et
              l'écran affirmait « Aucun repas aujourd'hui ». Une panne de stockage se
              lisait comme un jeûne, ce qui est crédible et faux. */}
          {shown.isPending ? (
            <Skeleton />
          ) : shown.error ? (
            <Empty title="Journal indisponible">
              {shown.error instanceof Error ? shown.error.message : 'Le serveur n’a pas répondu.'}
            </Empty>
          ) : shown.data && shown.data.meals.length > 0 ? (
            shown.data.meals.map((meal) => (
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
          ) : shownDay?.key === 'yesterday' ? (
            <Empty
              title="Aucun repas noté hier"
              action={
                <Button
                  variant="ghost"
                  onClick={() => {
                    openSheetOn('hier');
                  }}
                >
                  Rattraper un repas d’hier
                </Button>
              }
            >
              Un repas oublié se rattrape ici : une description suffit, l’heure n’est pas demandée.
            </Empty>
          ) : (
            <Empty title="Aucun repas aujourd'hui">
              Une description suffit. Les chiffres peuvent venir après.
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
          // Remontée quand l'adresse impose un jour : c'est à l'initialisation qu'elle le
          // prend. Le brouillon, lui, survit au remontage — il est dans le navigateur.
          key={`${askedDay ?? 'libre'}-${askedCode ?? ''}`}
          open={adding}
          suggested={data.suggested_type}
          types={data.types}
          ingredients={data.ingredients}
          days={data.days}
          initialDay={data.days.find((day) => day.key === askedDay)?.date}
          initialBarcode={askedCode}
          favorites={data.favorites}
          onClose={closeSheet}
          onSaved={() => {
            closeSheet();
            invalidate();
          }}
        />
      )}
    </div>
  );
}
