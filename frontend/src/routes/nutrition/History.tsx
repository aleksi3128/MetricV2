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
  CardHead,
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
import { integer, num, percent, plural, shortDate } from '@/lib/format';
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

/** Une initiale de 12 px ne tient que dans une cellule qui en fait 20. */
const WEEKDAYS_SHOWN: Record<HistoryRange, boolean> = {
  month: true,
  quarter: false,
  year: false,
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
      <span>aucun repas</span>
      <HeatSwatch tone="off" />
      <span className={styles.legendGap} />
      <span>non chiffré</span>
      <HeatSwatch tone="neutralised" />
      <span className={styles.legendGap} />
      {/* Un gradient de quantité, pas un barème : plus foncé veut dire plus mangé, et
          l'objectif est le repère au milieu — pas une note en haut.

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

/** Les tuiles de la plage. Les deux dernières n'apparaissent qu'à partir de 600 px. */
function Tiles({ data, wide }: { data: NutritionHistory; wide: boolean }) {
  const { stats } = data;
  const measured = stats.measured_days;

  return (
    <div className="grid tiles">
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
          label="Dans la cible"
          value={measured > 0 ? integer(stats.on_target_days) : '—'}
          unit={measured > 0 ? plural(stats.on_target_days, 'jour') : undefined}
          detail={
            measured > 0 ? `sur ${measured} ${plural(measured, 'chiffré')} · ±10 %` : undefined
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
      labels={series.map((point) => shortDate(point.date))}
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
                tone: 'effort',
                dashed: true,
              },
            ]
          : []
      }
      context={
        wide
          ? {
              label: 'Protéines',
              unit: 'g',
              values: series.map((point) => point.protein_g),
              tone: 'effort',
              format: (value) => num(value, 0),
            }
          : undefined
      }
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
          : `${stats.measured_days} ${plural(stats.measured_days, 'jour')} chiffré${stats.measured_days > 1 ? 's' : ''} sur ${stats.days} : un jour sans calories notées n'est pas un jour à zéro, il ne descend pas dans la courbe.`
      }
    />
  );
}

/** Les deux lectures d'habitude, réservées aux écrans qui ont la largeur de les tenir. */
function Habits({ data }: { data: NutritionHistory }) {
  const measured = data.stats.measured_days;

  return (
    <div className={styles.split}>
      <Card>
        <h3>Profil de la semaine</h3>
        <p className={styles.note}>
          Moyenne d’un lundi, d’un mardi… sur la plage. Les jours sans repas chiffré n’ont pas de
          barre.
        </p>
        {measured > 0 ? (
          <div className={styles.habit}>
            <Bars
              rows={data.weekdays.map((profile) => ({
                label: DAY_NAMES[profile.weekday] ?? '—',
                ratio: profile.ratio,
                value:
                  profile.avg_calories === null ? '—' : `${integer(profile.avg_calories)} kcal`,
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

      <Card>
        <h3>D’où viennent les calories</h3>
        <p className={styles.note}>Part de chaque type de repas sur la plage.</p>
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
    </div>
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
      <Rule>Historique</Rule>

      <Card>
        <CardHead>
          <h3>Calories par jour</h3>
          <Segmented
            options={RANGES}
            value={range}
            onChange={setRange}
            label="Plage de l’historique"
          />
        </CardHead>

        {isPending ? (
          <Skeleton lines={4} />
        ) : error !== null || data === undefined ? (
          <Empty title="Historique indisponible">
            La grille revient dès que les repas se relisent.
          </Empty>
        ) : (
          <div className={cx(styles.heat, CELL_CLASS[range])}>
            <Heatmap
              days={toHeatDays(data.days)}
              label="Grille des calories par jour"
              today={data.today}
              weekdays={WEEKDAYS_SHOWN[range]}
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
        )}
      </Card>

      {data !== undefined && (
        <>
          <Tiles data={data} wide={wide} />
          <Card>
            <Curve data={data} wide={wide} />
          </Card>
          {wide && <Habits data={data} />}
        </>
      )}
    </>
  );
}
