/**
 * Un programme de nage, tel que le serveur l'a lu (`docs/planning-natation.md` §2.3).
 *
 * **Il ne lit rien lui-même.** Les lignes arrivent réécrites — `8×100`, pas `8x100` —, les
 * totaux arrivent calculés, et un programme fautif arrive sans total. Reconnaître un sigle
 * ici serait une seconde implémentation de la notation, qui divergerait de celle du serveur
 * au premier sigle ajouté en Réglages.
 *
 * Partagé par le panneau du jour, la proposition du fil et le formulaire : trois copies
 * donneraient trois façons d'écrire « 1 400 m · CR 1 200 », et la première qui change
 * ferait mentir les deux autres.
 */

import { cx } from '@/lib/cx';
import type { SwimLine, SwimProgram } from '@/features/planning/api';

import { swimSummary } from './swim';
import styles from './SwimProgram.module.css';

export function SwimProgramView({
  program,
  compact = false,
}: {
  program: SwimProgram;
  /** Sans les lignes — le total seul, pour une liste où le détail se lit ailleurs. */
  compact?: boolean;
}) {
  // Une natation sans programme : un tiret et non « 0 m », qui passerait pour un relevé.
  if (program.lines.length === 0 && program.errors.length === 0) {
    return <p className={styles.empty}>Sans programme — piscine libre.</p>;
  }

  const summary = swimSummary(program);

  return (
    <div className={styles.program}>
      {!compact && (
        <ol className={styles.lines} aria-label="Programme prévu">
          {program.lines.map((line) => (
            <li
              key={`${String(line.number)}-${line.text}`}
              className={cx(line.kind === 'section' ? styles.section : styles.block)}
            >
              {line.text}
            </li>
          ))}
        </ol>
      )}

      {summary !== null ? (
        <p className={styles.total}>{summary}</p>
      ) : (
        // Un programme écrit avant qu'un sigle ne quitte le glossaire, ou retapé à la main
        // dans le tableur : il garde ses lignes lisibles, et dit pourquoi il n'a pas de total.
        <ul className={styles.errors}>
          {program.errors.map((error) => (
            <li key={`${String(error.line)}-${error.message}`}>
              {error.line > 0 ? `Ligne ${String(error.line)} : ` : ''}
              {error.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * La séance **nagée**, réécrite par le serveur : `4×50 CR R~40`.
 *
 * Deux marques, et ni l'une ni l'autre n'est une valeur proposée — c'est un relevé de la
 * montre, dit avec ses réserves. « douteux » : une longueur a été comptée deux fois, le
 * total est fragile. « nage lue » : personne n'a confirmé la nage que la montre a cru voir.
 */
export function SwimDoneView({ lines }: { lines: SwimLine[] }) {
  return (
    <ol className={styles.lines} aria-label="Séance nagée">
      {lines.map((line) => (
        <li key={`${line.laps.join('-')}-${line.text}`} className={styles.block}>
          {line.text}
          {line.suspect && <span className={styles.flag}>douteux</span>}
          {line.detected && <span className={styles.flagSoft}>nage lue</span>}
        </li>
      ))}
    </ol>
  );
}
