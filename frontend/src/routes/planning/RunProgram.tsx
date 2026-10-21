/**
 * La séance de course en notation (`docs/planifier-une-seance.md`, D1–D3) : le champ, ses
 * puces, l'aperçu **lu par le serveur**, et la vue d'une séance lue.
 *
 * L'écran ne lit rien : déplier `5 × ( … )`, trouver la plage d'une zone, additionner les
 * blocs sont la règle du format, et elle n'a qu'une implémentation — `run_notation.py`.
 * Le pouce tape `x`, `’`, `"` : le serveur les comprend. Le champ coupe seulement la
 * majuscule et la correction automatique, qui « corrigeraient » `LD` en `Le`.
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { Chip, ChipStrip, TextArea } from '@/components/ui';
import { planningApi, type RunProgram } from '@/features/planning/api';
import { cx } from '@/lib/cx';
import { keys } from '@/lib/query';

import styles from './RunProgram.module.css';

const SYNTAX: { text: string; spaced: boolean }[] = [
  { text: '×', spaced: false },
  { text: "'", spaced: false },
  { text: '(', spaced: false },
  { text: ')', spaced: false },
  { text: '+', spaced: true },
  { text: 'r', spaced: true },
];
const CODES = ['EF', 'SL', 'T', 'VMA', 'AS10', 'LD', 'RC'];

const GLOSSARY: [string, string][] = [
  ['EF', 'endurance fondamentale'],
  ['SL', 'sortie longue'],
  ['T', 'seuil'],
  ['VMA', 'VMA'],
  ['AS5 · AS10 · ASS · ASM', 'allure 5 km, 10 km, semi, marathon'],
  ['LD', 'ligne droite'],
  ['RC', 'retour au calme'],
];

/** Un délai, pour ne lire la séance qu'une fois la frappe posée. */
function useSettled(value: string, delay: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(value);
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay]);
  return settled;
}

/** Une séance lue : les blocs avec leur cible, puis le total. */
export function RunProgramView({ program }: { program: RunProgram }) {
  if (program.errors.length > 0) {
    const fault = program.errors[0];
    return (
      <p className={styles.error} role="alert">
        {fault?.token ? `« ${fault.token} » : ${fault.message}` : fault?.message}
      </p>
    );
  }
  return (
    <>
      <ul className={styles.lines}>
        {program.lines.map((line, index) => (
          <li
            // L'ordre est celui de la séance, et une ligne n'a pas d'identité propre.
            key={index}
            className={cx(
              styles.line,
              line.depth === 1 && styles.depth1,
              line.depth >= 2 && styles.depth2,
              line.kind === 'group' && styles.group,
              line.kind === 'recovery' && styles.recovery,
            )}
          >
            {line.text}
          </li>
        ))}
      </ul>
      {program.summary !== '' && <p className={styles.summary}>{program.summary}</p>}
    </>
  );
}

export function RunProgramField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const settled = useSettled(value, 400);
  const preview = useQuery({
    queryKey: keys.planning.runParse(settled),
    queryFn: () => planningApi.parseRun(settled),
    enabled: settled.trim() !== '',
    staleTime: Infinity,
  });

  /** Insère au curseur, comme une touche. */
  function insert(text: string, spaced: boolean): void {
    const node = field.current;
    const start = node?.selectionStart ?? value.length;
    const end = node?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const glue = spaced && before !== '' && !/[\s(]$/u.test(before) ? ' ' : '';
    const piece = `${glue}${text}${spaced ? ' ' : ''}`;
    onChange(`${before}${piece}${value.slice(end)}`);
    window.requestAnimationFrame(() => {
      if (node === null) return;
      node.focus();
      const caret = before.length + piece.length;
      node.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className={styles.field}>
      <TextArea
        ref={field}
        label="Séance"
        value={value}
        placeholder={"15' EF + 5 × (1 km 6'00 + 80 m LD 3'30) + 10' RC"}
        hint="Facultative : vide, un footing libre de la durée choisie."
        error={error}
        rows={3}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <ChipStrip label="Insérer dans la séance">
        {SYNTAX.map((item) => (
          <Chip
            key={item.text}
            onClick={() => {
              insert(item.text, item.spaced);
            }}
          >
            {item.text}
          </Chip>
        ))}
        {CODES.map((code) => (
          <Chip
            key={code}
            onClick={() => {
              insert(code, true);
            }}
          >
            {code}
          </Chip>
        ))}
      </ChipStrip>

      {/* L'aperçu ne s'affiche que sur le texte qu'il a lu : celui d'un texte qu'on vient
          de changer serait faux d'une frappe. */}
      {value.trim() !== '' && preview.data !== undefined && settled === value && (
        <div className={styles.preview} aria-live="polite">
          <span className={styles.previewTitle}>Lu par le serveur</span>
          <RunProgramView program={preview.data} />
        </div>
      )}

      <details className={styles.glossary}>
        <summary>La notation</summary>
        <p>
          Un bloc : une quantité (<code>1 km</code>, <code>800 m</code>, <code>15&apos;</code>,{' '}
          <code>1h10</code>), un sigle, une cible — une allure <code>6&apos;00</code> ou{' '}
          <code>5&apos;40-5&apos;50</code>, un temps <code>en 4&apos;10</code>, une FC{' '}
          <code>140-150</code>, une zone <code>Z2</code>, un effort <code>RPE7</code>. Un groupe :{' '}
          <code>5 × ( … )</code>, et sa récupération <code>r1&apos;30</code> ou <code>r200 m</code>.
          Sans cible, un sigle prend la plage de sa zone.
        </p>
        <ul>
          {GLOSSARY.map(([code, label]) => (
            <li key={code}>
              <code>{code}</code> {label}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
