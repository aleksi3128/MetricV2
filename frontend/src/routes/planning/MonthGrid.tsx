/**
 * La grille du mois (`PLAN-01`).
 *
 * Sept colonnes dans 390 px laissent moins de cinquante pixels par jour : **une case ne
 * porte pas de texte**, seulement le quantième et des marques. La grille répond à
 * « quand », le panneau du jour à « quoi ».
 *
 * ## La natation se lit à la forme, pas à la couleur
 *
 * La charte a quatre couleurs, et chacune a un sens — `signal` mesure, `effort` tient. En
 * ajouter une cinquième pour une nature de séance serait changer la charte pour un
 * calendrier. La natation garde donc les couleurs de tout le monde (contour prévu, plein
 * effectué) et change de **forme** : une barre, comme une longueur, là où les autres
 * séances sont un point. La différence se voit sans dépendre de la couleur, et le nom
 * accessible la dit en toutes lettres.
 */

import type { DayCell, MonthView } from '@/features/planning/api';
import { cx } from '@/lib/cx';
import { longDate } from '@/lib/format';

import styles from '../Planning.module.css';
import { WEEKDAY_NAMES, WEEKDAYS, monthLabel } from './shared';

function count(value: number, singular: string, many: string): string | null {
  if (value === 0) return null;
  return `${String(value)} ${value > 1 ? many : singular}`;
}

function DayButton({
  cell,
  today,
  selected,
  onSelect,
}: {
  cell: DayCell;
  today: string;
  selected: boolean;
  onSelect: (day: string) => void;
}) {
  const quantieme = Number(cell.date.slice(8));
  const swimsPlanned = cell.planned.filter((item) => item.kind === 'natation').length;
  const othersPlanned = cell.planned.length - swimsPlanned;
  const swimsDone = cell.done.filter((item) => item.kind === 'swim').length;
  const othersDone = cell.done.length - swimsDone;

  // Le nom accessible dit ce que la case montre : des pastilles de six pixels ne se lisent
  // pas à la synthèse vocale, et « 12 » tout seul ne dirait rien.
  const label = [
    longDate(`${cell.date}T12:00:00`),
    count(swimsPlanned, 'natation prévue', 'natations prévues'),
    count(othersPlanned, 'séance prévue', 'séances prévues'),
    count(swimsDone, 'natation faite', 'natations faites'),
    count(othersDone, 'séance faite', 'séances faites'),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      className={cx(
        styles.day,
        !cell.in_month && styles.dayOutside,
        cell.date === today && styles.dayToday,
        selected && styles.daySelected,
      )}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => {
        onSelect(cell.date);
      }}
    >
      <span className={styles.dayNumber}>{quantieme}</span>
      <span className={styles.marks} aria-hidden="true">
        {swimsPlanned > 0 && <span className={cx(styles.markPlanned, styles.markSwim)} />}
        {othersPlanned > 0 && <span className={styles.markPlanned} />}
        {swimsDone > 0 && <span className={cx(styles.markDone, styles.markSwim)} />}
        {othersDone > 0 && <span className={styles.markDone} />}
      </span>
    </button>
  );
}

export function MonthGrid({
  view,
  selected,
  onSelect,
}: {
  view: MonthView;
  selected: string;
  onSelect: (day: string) => void;
}) {
  return (
    <div
      className={styles.grid}
      role="grid"
      aria-label={`Calendrier de ${monthLabel(view.month.slice(0, 7))}`}
    >
      <div className={styles.weekdays} role="row">
        {WEEKDAYS.map((letter, index) => (
          <span key={WEEKDAY_NAMES[index]} role="columnheader" aria-label={WEEKDAY_NAMES[index]}>
            {letter}
          </span>
        ))}
      </div>

      <div className={styles.days}>
        {view.days.map((cell) => (
          <DayButton
            key={cell.date}
            cell={cell}
            today={view.today}
            selected={cell.date === selected}
            onSelect={onSelect}
          />
        ))}
      </div>

      <p className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.markPlanned} aria-hidden="true" /> prévu
        </span>
        <span className={styles.legendItem}>
          <span className={styles.markDone} aria-hidden="true" /> fait
        </span>
        <span className={styles.legendItem}>
          <span className={cx(styles.markPlanned, styles.markSwim)} aria-hidden="true" /> natation
        </span>
      </p>
    </div>
  );
}
