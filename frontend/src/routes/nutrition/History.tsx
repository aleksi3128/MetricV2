/**
 * La profondeur de l'écran Nutrition — grille, courbe et habitudes (`NUT-11`).
 *
 * L'écran ne montrait qu'un jour. Il répond maintenant à « est-ce que je mange comme
 * d'habitude ? », qui demande une plage et non une journée.
 *
 * ## Ce qui n'est pas calculé ici
 *
 * Rien. Niveaux d'intensité, tendance glissante, moyennes, parts, profil de semaine :
 * tout arrive chiffré de `/api/nutrition/history`. Ce fichier choisit des mots, des
 * couleurs et une mise en page — et la seule chose qu'il décide vraiment, c'est **ce
 * qu'il ne dessine pas** sur un téléphone.
 *
 * ## Le retrait sur téléphone, et ce qu'il ne retire pas
 *
 * Deux couches de contexte et deux lectures d'habitude tombent sous 600 px. Aucun chiffre
 * ne disparaît pour autant : les protéines et les sucres restent dans l'infobulle de
 * chaque cellule, et les moyennes de la plage restent dans les tuiles. Ce qui tombe, ce
 * sont des tracés qui demandent une largeur qu'un téléphone n'a pas — quatre couches
 * empilées dans 390 px se lisent comme une seule tache.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Bars,
  Card,
  Chart,
  Empty,
  type HeatDay,
  HeatSwatch,
  Heatmap,
  Rule,
  Segmented,
  type SegmentedOption,
  Skeleton,
  Stat,
} from '@/components/ui';
import {
  nutritionApi,
  type HistoryDay,
  type HistoryRange,
  type NutritionHistory,
} from '@/features/nutrition/api';
import { cx } from '@/lib/cx';
import { dayMonth, integer, longDate, num, percent, plural } from '@/lib/format';
import { WIDE, useMediaQuery } from '@/lib/media';
import { keys } from '@/lib/query';

import styles from '../Nutrition.module.css';

const RANGES: readonly SegmentedOption<HistoryRange>[] = [
  { value: 'month', label: '1 mois' },
  { value: 'quarter', label: '3 mois' },
  { value: 'year', label: '1 an' },
];

/**
 * Taille de cellule par plage.
 *
 * Une grille de cinq colonnes à 12 px occuperait 75 px de large au milieu d'une carte qui
 * en fait 330 : la cellule grossit quand les colonnes se raréfient. Les trois valeurs
 * sont posées en variables CSS, que le composant lit — sa feuille de style reste la
 * sienne, et aucun style en ligne ne part d'ici.
 */
const CELL_CLASS: Record<HistoryRange, string | undefined> = {
  month: styles.gridMonth,
  quarter: styles.gridQuarter,
  year: styles.gridYear,
};

/**
 * Largeur de la colonne de gauche, par plage.
 *
 * Une grille de cinq colonnes ne remplira jamais une carte de 875 px : sept lignes ne
 * s'élargissent pas sans s'allonger d'autant, et une cellule à 130 px donnerait un mois
 * haut de 950. C'est donc **la carte qui se règle sur la grille**, et non l'inverse — un
 * mois n'a pas besoin de la même largeur qu'un trimestre.
 *
 * La classe porte une variable plutôt qu'une grille complète : la disposition reste
 * écrite une fois dans `.historyTop`, ce qui la change reste une valeur.
 */
const COLUMN_CLASS: Record<HistoryRange, string | undefined> = {
  month: styles.topMonth,
  quarter: styles.topQuarter,
  year: styles.topYear,
};

/** Une initiale de 12 px ne tient que dans une cellule qui en fait 20. */
const WEEKDAYS_SHOWN: Record<HistoryRange, boolean> = {
  month: true,
  quarter: false,
  year: false,
};

/**
 * Sens de lecture, par plage.
 *
 * **Un mois se lit en calendrier, pas en colonnes de semaines.** Cinq semaines posées en
 * colonnes font une grille deux fois plus haute que large : elle occupait sept rangées
 * pour un cinquième de la largeur de sa carte, soit le pire des deux mondes — trop haute
 * sur un téléphone, trop étroite partout. Tournée d'un quart, elle tient en cinq rangées
 * et remplit la largeur, et c'est en prime la forme qu'un mois a partout ailleurs.
 *
 * Le trimestre et l'année gardent les colonnes de semaines : treize et cinquante-trois
 * colonnes de jours ne se dessinent pas, et c'est bien la largeur qui doit porter le
 * temps quand il y en a beaucoup.
 */
const LAYOUT: Record<HistoryRange, 'weeks' | 'calendar'> = {
  month: 'calendar',
  quarter: 'weeks',
  year: 'weeks',
};

const DAY_NAMES: readonly string[] = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];

/**
 * Ce que dit l'infobulle d'une cellule.
 *
 * Trois vides à ne jamais confondre : un jour sans repas, un jour relevé sans ses
 * chiffres, et un jour d'avant le premier repas noté. Une seule phrase pour les trois
 * ferait mentir la grille exactement là où elle a quelque chose à apprendre.
 */
function describe(day: HistoryDay): string {
  if (day.reason === 'before_track') return 'avant le premier repas noté';
  if (day.reason === 'future') return 'à venir';
  if (day.reason === 'unmeasured') {
    const macros = day.protein_g > 0 ? ` · ${num(day.protein_g, 0)} g prot.` : '';
    return `${day.meals} ${plural(day.meals, 'repas', 'repas')} · calories non chiffrées${macros}`;
  }
  if (day.meals === 0) return 'aucun repas noté';

  const parts = [`${integer(day.calories)} kcal`];
  if (day.protein_g > 0) parts.push(`${num(day.protein_g, 0)} g prot.`);
  if (day.added_sugar_g > 0) parts.push(`${num(day.added_sugar_g, 0)} g sucres`);
  parts.push(`${day.meals} ${plural(day.meals, 'repas', 'repas')}`);
  return parts.join(' · ');
}

/** Les cellules, dans la forme que le composant de grille attend. */
function toHeatDays(days: readonly HistoryDay[]): HeatDay[] {
  return days.map((day) => ({
    date: day.date,
    value: day.calories,
    state: day.state,
    level: day.level,
    reason: day.reason,
  }));
}

function Legend() {
  return (
    <>
      {/* Chaque paire est insécable, comme le dégradé : « non chiffré » et sa pastille se
          retrouvaient sur deux lignes dès que la carte se resserrait, et une pastille
          orpheline en tête de ligne n'explique plus rien. */}
      <span className={styles.legendScale}>
        aucun repas
        <HeatSwatch tone="off" />
      </span>
      <span className={styles.legendGap} />
      <span className={styles.legendScale}>
        non chiffré
        <HeatSwatch tone="neutralised" />
      </span>
      <span className={styles.legendGap} />
      {/* Un gradient de quantité, pas un barème : plus foncé veut dire plus mangé **que
          d'habitude**, et `ScaleNote` sous la grille donne les trois seuils en kcal.

          Les six éléments tiennent dans **un seul** bloc insécable : à 390 px la légende
          passait à la ligne entre « moins » et « plus », et le dégradé se lisait alors à
          l'envers sur deux lignes. */}
      <span className={styles.legendScale}>
        moins
        <HeatSwatch tone="level1" />
        <HeatSwatch tone="level2" />
        <HeatSwatch tone="level3" />
        <HeatSwatch tone="level4" />
        plus
      </span>
    </>
  );
}

/**
 * Ce que « moins → plus » ne disait pas : moins que quoi.
 *
 * Quatre pastilles dans un dégradé nomment un ordre et aucune quantité. Les seuils
 * viennent du serveur, qui découpe la plage en quarts — les recalculer ici serait la
 * deuxième définition de l'échelle, et deux définitions divergent au premier cas limite.
 */
function ScaleNote({ bounds }: { bounds: readonly number[] }) {
  const [low, mid, high] = bounds;

  if (low === undefined || mid === undefined || high === undefined) {
    return (
      <p className={styles.note}>
        Deux jours chiffrés suffisent à répartir les teintes. En dessous, la couleur ne compare
        rien.
      </p>
    );
  }

  return (
    <p className={styles.note}>
      Une teinte par quart de tes jours chiffrés : jusqu’à {integer(low)}, {integer(mid)} et{' '}
      {integer(high)} kcal, puis au-delà.
    </p>
  );
}

/**
 * Le signe d'un écart, que `integer` seul ne porte pas.
 *
 * « 1 366 » et « −1 366 » ne disent pas la même chose, et un écart positif sans son plus
 * se lirait comme un total. Le formatage vit ici, la soustraction chez le serveur.
 */
function signed(value: number): string {
  return value > 0 ? `+${integer(value)}` : integer(value);
}

/**
 * Les tuiles de la plage. Les deux dernières n'apparaissent qu'à partir de 600 px.
 *
 * **« Dans la cible » n'y est plus.** Sur un objectif de 2 700 kcal tenu par un journal à
 * 1 334 de moyenne, elle affichait « 0 jour sur 27 » et n'afficherait jamais rien
 * d'autre : un gros zéro en tête de tuile, qui se lit comme un échec là où il n'y a
 * qu'une échelle mal placée. Le compte survit en détail de l'écart, qui, lui, bouge et
 * explique pourquoi il reste à zéro.
 *
 * Ce qui monte à sa place sur téléphone, c'est l'écart lui-même. Pas les sucres, qui
 * auraient répété « plafond 30 g » à deux tuiles d'intervalle de ceux du jour, juste
 * au-dessus — deux fois le même détail se lit comme une erreur d'affichage.
 */
function Tiles({ data, wide }: { data: NutritionHistory; wide: boolean }) {
  const { stats } = data;
  const measured = stats.measured_days;

  return (
    <div className={styles.tiles}>
      <Card>
        <Stat
          compact
          label="Moyenne"
          value={stats.avg_calories === null ? '—' : integer(stats.avg_calories)}
          unit={stats.avg_calories === null ? undefined : 'kcal'}
          detail={
            measured > 0
              ? `objectif ${integer(stats.target_calories)} kcal`
              : 'aucun jour chiffré sur la plage'
          }
        />
      </Card>
      <Card>
        <Stat
          compact
          // « Écart à l'objectif » passait à la ligne dans une tuile de 155 px, et les
          // deux chiffres de la paire ne s'alignaient plus. La tuile voisine nomme
          // l'objectif juste à côté ; le signe et « kcal/j » disent le reste.
          label="Écart"
          value={stats.gap_to_target === null ? '—' : signed(stats.gap_to_target)}
          unit={stats.gap_to_target === null ? undefined : 'kcal/j'}
          // Rien plutôt que le même « aucun jour chiffré sur la plage » que la tuile
          // voisine : deux fois la même phrase côte à côte se lit comme un bug
          // d'affichage, et le tiret dit déjà qu'il n'y a pas d'écart à donner.
          detail={
            measured > 0
              ? `dans la cible ${integer(stats.on_target_days)} sur ${measured} · ±10 %`
              : undefined
          }
        />
      </Card>
      {wide && (
        <>
          <Card>
            <Stat
              compact
              label="Protéines"
              value={stats.avg_protein_g === null ? '—' : num(stats.avg_protein_g, 0)}
              unit={stats.avg_protein_g === null ? undefined : 'g/j'}
              detail={
                stats.logged_days > 0
                  ? `sur ${stats.logged_days} ${plural(stats.logged_days, 'jour')} noté${stats.logged_days > 1 ? 's' : ''}`
                  : undefined
              }
            />
          </Card>
          <Card>
            <Stat
              compact
              label="Sucres au-dessus"
              value={stats.logged_days > 0 ? integer(stats.over_sugar_days) : '—'}
              unit={stats.logged_days > 0 ? plural(stats.over_sugar_days, 'jour') : undefined}
              detail={`plafond ${num(data.added_sugar_max_g, 0)} g`}
              direction={stats.over_sugar_days > 0 ? 'down' : undefined}
            />
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * La courbe. Deux couches sur téléphone, quatre au-delà.
 *
 * La série ne porte que les jours **chiffrés** : la note dit lesquels, sans quoi une
 * courbe trouée passerait pour une courbe continue.
 */
function Curve({ data, wide }: { data: NutritionHistory; wide: boolean }) {
  const { series, stats } = data;
  const weekly = data.granularity === 'week';

  if (series.length < 2) {
    return (
      <Empty title="Pas encore de courbe">
        Deux jours avec leurs calories suffisent à tracer une tendance.
      </Empty>
    );
  }

  const trend = series.map((point) => point.trend_calories);
  const smoothed = trend.every((value) => value !== null);

  return (
    <Chart
      labels={series.map((point) => dayMonth(point.date))}
      primary={{
        // « Calories » tout court entrait en collision avec le champ du même nom
        // dans les repas récurrents : deux éléments portaient le même nom accessible
        // sur une seule page.
        label: weekly ? 'Calories, moyenne par jour' : 'Calories par jour',
        unit: 'kcal',
        values: series.map((point) => point.calories),
        tone: 'signal',
        format: (value) => integer(value),
      }}
      overlays={
        smoothed
          ? [
              {
                label: 'Tendance 7 j',
                unit: 'kcal',
                // Calculée par le serveur sur sept jours calendaires.
                values: trend.map((value) => value ?? 0),
                // **Le ton des calories, et non celui de l'effort.** La tendance portait
                // le vert en pointillé — exactement ce que porte la couche des protéines
                // juste en dessous : deux séries qui n'ont ni la même unité ni la même
                // échelle se peignaient du même trait, et la légende ne pouvait plus
                // désigner laquelle est laquelle. Ce trait *est* des calories, sur l'axe
                // des calories : il en prend la couleur, et le pointillé dit qu'il est
                // lissé. Le vert redevient libre pour les protéines, qui n'ont pas
                // d'autre ton disponible sur ce graphique.
                tone: 'signal',
                dashed: true,
              },
            ]
          : []
      }
      // **Les protéines ne sont plus une couche de contexte ici : elles ont leur propre
      // courbe.** Superposées, elles portaient une seconde échelle sans graduation sur un
      // tracé qui en avait déjà une, et n'apparaissaient qu'au-delà de 600 px — c'est-à-dire
      // jamais sur l'écran visé. Une courbe à elles, graduée et lisible au téléphone, dit
      // ce que ce fantôme suggérait.
      band={
        wide
          ? {
              label: 'Sucres ajoutés',
              unit: 'g',
              values: series.map((point) => point.added_sugar_g),
              tone: 'load',
              // Au-dessus du plafond, la barre passe au ton d'alerte : un dépassement
              // est un signal, et il l'est ici comme dans les totaux du jour.
              alertAbove: data.added_sugar_max_g,
              format: (value) => num(value, 0),
            }
          : undefined
      }
      note={
        weekly
          ? `Une semaine par point, moyenne des jours chiffrés — ${stats.measured_days} sur ${stats.days}.`
          : `${stats.measured_days} ${plural(stats.measured_days, 'jour')} chiffré${stats.measured_days > 1 ? 's' : ''} sur ${stats.days} — un jour sans calories notées ne descend pas dans la courbe.`
      }
    />
  );
}

/**
 * Les protéines par jour, contre leur objectif.
 *
 * Elles n'existaient qu'en couche de contexte sur la courbe des calories, en pointillé et
 * sans graduation — et seulement au-delà de 600 px. Sur l'écran visé, la seule macro que
 * l'application suit toute la journée dans un anneau n'avait donc **aucune courbe**.
 *
 * L'objectif est une série plate plutôt qu'une graduation : une graduation se lit comme
 * une valeur atteinte par la courbe, une ligne nommée dans la légende se lit comme un
 * repère. Le ton la sépare des deux autres traits, qui sont tous deux des protéines.
 */
function ProteinCurve({ data }: { data: NutritionHistory }) {
  const { series, stats } = data;
  const weekly = data.granularity === 'week';

  if (series.length < 2) {
    return (
      <Empty title="Pas encore de courbe">
        Deux jours de repas notés suffisent à tracer les protéines.
      </Empty>
    );
  }

  const trend = series.map((point) => point.trend_protein_g);
  const smoothed = trend.every((value) => value !== null);
  const target = data.protein_target_g;

  return (
    <Chart
      labels={series.map((point) => dayMonth(point.date))}
      primary={{
        label: weekly ? 'Protéines, moyenne par jour' : 'Protéines par jour',
        unit: 'g',
        values: series.map((point) => point.protein_g),
        tone: 'effort',
        format: (value) => num(value, 0),
        // Le domaine englobe l'objectif : sans lui, une plage entièrement sous la cible
        // cadrerait le tracé sur ses seules valeurs et la ligne d'objectif sortirait du
        // cadre — un repère hors champ ne repère rien.
        domain: [
          Math.min(target, ...series.map((point) => point.protein_g)),
          Math.max(target, ...series.map((point) => point.protein_g)),
        ],
      }}
      overlays={[
        ...(smoothed
          ? [
              {
                label: 'Tendance 7 j',
                unit: 'g',
                values: trend.map((value) => value ?? 0),
                tone: 'effort' as const,
                dashed: true,
              },
            ]
          : []),
        {
          label: `Objectif ${num(target, 0)} g`,
          unit: 'g',
          values: series.map(() => target),
          tone: 'signal' as const,
          dashed: true,
        },
      ]}
      note={
        stats.avg_protein_g === null
          ? 'Aucun jour noté sur la plage.'
          : `${num(stats.avg_protein_g, 0)} g par jour en moyenne sur ${stats.logged_days} ${plural(stats.logged_days, 'jour')} noté${stats.logged_days > 1 ? 's' : ''}.`
      }
    />
  );
}

/**
 * Le profil de la semaine, réservé aux écrans qui ont la largeur de le tenir.
 *
 * Il occupe toute la largeur depuis que la répartition par type est montée à côté de la
 * grille : c'était le seul moyen de remplir la colonne de droite de la ligne de tête, et
 * sept barres n'ont rien à perdre à s'allonger — c'est même leur longueur qui se compare.
 */
function WeekdayProfile({ data }: { data: NutritionHistory }) {
  const measured = data.stats.measured_days;

  return (
    <Card>
      <h3>Profil de la semaine</h3>
      {/* **Ce que vaut une barre pleine.** Elle se rapportait au plus copieux des sept
          jours : celui-là remplissait toujours la sienne, y compris à 1 899 kcal sur un
          objectif de 2 700 — et une barre pleine se lit comme un objectif atteint. Elle
          se rapporte maintenant à l'objectif, comme la couleur le faisait déjà. */}
      <p className={styles.note}>
        Moyenne d’un lundi, d’un mardi… sur la plage. Barre pleine ={' '}
        {integer(data.stats.target_calories)} kcal, l’objectif.
      </p>
      {measured > 0 ? (
        <div className={styles.habit}>
          <Bars
            rows={data.weekdays.map((profile) => ({
              label: DAY_NAMES[profile.weekday] ?? '—',
              ratio: profile.ratio,
              value: profile.avg_calories === null ? '—' : `${integer(profile.avg_calories)} kcal`,
              tone: profile.over_target ? 'load' : 'signal',
            }))}
          />
        </div>
      ) : (
        <Empty title="Rien à comparer">
          Un jour chiffré par jour de semaine, et le profil apparaît.
        </Empty>
      )}
    </Card>
  );
}

/** D'où viennent les calories. Elle tient dans la colonne de côté, sous les tuiles. */
function TypeShares({ data }: { data: NutritionHistory }) {
  return (
    <Card>
      <h3>D’où viennent les calories</h3>
      <p className={styles.note}>
        Part de chaque type de repas dans les calories de la plage. Un type dont rien n’a été
        chiffré n’a pas de ligne.
      </p>
      {data.types.length > 0 ? (
        <div className={styles.habit}>
          <Bars
            rows={data.types.map((share) => ({
              label: share.meal_type,
              ratio: share.share,
              value: percent(share.share),
              tone: 'signal',
            }))}
          />
        </div>
      ) : (
        <Empty title="Aucune calorie sur la plage">
          La répartition se dessine dès qu’un repas est chiffré.
        </Empty>
      )}
    </Card>
  );
}

export function History() {
  const [range, setRange] = useState<HistoryRange>('month');
  const wide = useMediaQuery(WIDE);

  const { data, isPending, error } = useQuery({
    queryKey: keys.nutrition.history(range),
    queryFn: () => nutritionApi.history(range),
  });

  const byDate = new Map((data?.days ?? []).map((day) => [day.date, day]));

  return (
    <>
      {/* **Le sélecteur de plage n'appartenait pas à la carte de la grille.** Il y était
          posé en `CardHead`, ce qui le donnait pour un réglage de cette carte-là — alors
          qu'il change aussi les quatre tuiles, la courbe, la répartition et le profil de
          la semaine. Posé sur le filet de section, il porte ce qu'il commande, et rend au
          passage à la carte la largeur qu'il lui imposait. */}
      <div className={styles.historyHead}>
        <div className={styles.headRule}>
          <Rule>Historique</Rule>
        </div>
        <Segmented
          options={RANGES}
          value={range}
          onChange={setRange}
          label="Plage de l’historique"
        />
      </div>

      {/* **La grille et les chiffres de la plage, sur une même ligne.**
          Un mois fait cinq colonnes : 102 px de grille sur un téléphone, 191 px sur un
          Mac — dans une carte qui en offre 330 et 875. Les quatre cinquièmes de la carte
          étaient vides, et la légende s'était retrouvée à l'autre bout d'un vide qu'elle
          était censée expliquer. Une grille de sept lignes ne s'élargit pas sans
          s'allonger d'autant : ce qui remplit la place, c'est ce qu'on met à côté — ici
          les tuiles, qui mesurent exactement la même plage. */}
      <div className={cx(styles.historyTop, COLUMN_CLASS[range])}>
        <Card>
          <h3>Calories par jour</h3>
          {/* La plage, en toutes lettres. La disposition calendrier a retiré la rangée
              des mois — une colonne y vaut « tous les lundis » —, et sans elle rien à
              l'écran ne disait plus quelles semaines la grille couvre. */}
          {data !== undefined && (
            <p className={styles.note}>
              du {longDate(data.from)} au {longDate(data.to)}
            </p>
          )}

          {isPending ? (
            <Skeleton lines={4} />
          ) : error !== null || data === undefined ? (
            <Empty title="Historique indisponible">
              La grille revient dès que les repas se relisent.
            </Empty>
          ) : (
            <>
              <div className={cx(styles.heat, CELL_CLASS[range])}>
                <Heatmap
                  days={toHeatDays(data.days)}
                  label="Grille des calories par jour"
                  today={data.today}
                  weekdays={WEEKDAYS_SHOWN[range]}
                  layout={LAYOUT[range]}
                  // L'appui n'ouvre rien : la grille informe, elle ne mène pas à une
                  // correction. Une écriture sur un repas d'avant-hier n'existe pas dans
                  // l'API, et un bouton qui n'en fait qu'une moitié serait pire que rien.
                  describeDay={(day: HeatDay) => {
                    const found = byDate.get(day.date);
                    return found ? describe(found) : '';
                  }}
                  legend={<Legend />}
                />
              </div>
              <ScaleNote bounds={data.level_bounds} />
            </>
          )}
        </Card>

        {data !== undefined && (
          <div className={styles.aside}>
            <Tiles data={data} wide={wide} />
            {/* La répartition monte ici plutôt que de rester en bas de section : quatre
                tuiles ne font que la moitié de la hauteur de la grille, et le reste de la
                colonne était un trou. Les deux mesurent la même plage. */}
            {wide && <TypeShares data={data} />}
          </div>
        )}
      </div>

      {data !== undefined && (
        <>
          <Card>
            <Curve data={data} wide={wide} />
          </Card>
          <Card>
            <ProteinCurve data={data} />
          </Card>
          {wide && <WeekdayProfile data={data} />}
        </>
      )}
    </>
  );
}
