/**
 * Le champ d'un programme de nage, et ce qui l'accompagne : les puces qui insèrent au
 * curseur, l'aperçu **lu par le serveur**, le glossaire replié.
 *
 * Sorti du formulaire du planning quand la saisie d'une natation faite en a eu besoin
 * (`docs/natation-activite.md` §4) : deux copies auraient donné deux claviers de puces et
 * deux aperçus, et le premier sigle ajouté en Réglages n'aurait été montré que par l'un.
 *
 * Le clavier du téléphone est l'adversaire : il n'a pas de `×`, change `'` en `’`, met une
 * majuscule en tête et « corrige » `PB` en `Pb`. Le serveur tolère les deux premiers ; le
 * champ coupe les deux autres. L'aperçu arrive 400 ms après la dernière frappe.
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { Chip, ChipStrip, TextArea } from '@/components/ui';
import { planningApi, type SwimCodeEntry } from '@/features/planning/api';
import { keys } from '@/lib/query';

import styles from '../Planning.module.css';
import { SwimProgramView } from './SwimProgram';

/** Ce que le pouce tape mal, en tête ; les sigles les plus courants ensuite. */
const SYNTAX: { text: string; label: string; spaced: boolean }[] = [
  { text: '×', label: '×', spaced: false },
  { text: "'", label: "'", spaced: false },
  { text: 'R', label: 'R', spaced: false },
  { text: 'D', label: 'D', spaced: false },
  { text: ':', label: ': (section)', spaced: false },
];
const FREQUENT = ['CR', 'DOS', 'BR', 'EF', 'EA', 'SP', 'RC', 'PB', 'ÉD'];

/** Un délai, pour ne lire le programme qu'une fois la frappe posée. */
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

function Glossary({ codes }: { codes: SwimCodeEntry[] }) {
  const groups: { title: string; category: SwimCodeEntry['category'] }[] = [
    { title: 'Nages', category: 'stroke' },
    { title: 'Allures', category: 'pace' },
    { title: 'Options', category: 'option' },
  ];
  return (
    <details className={styles.glossary}>
      <summary>Les sigles</summary>
      <p className={styles.note}>
        Un bloc : <code>8×100 CR EA PB R20</code> — répétitions et distance, une nage, une allure,
        des options, puis le repos (<code>R15</code>, <code>R1&apos;30</code>) ou le départ (
        <code>D1&apos;45</code>). Une ligne finie par « : » est un titre.
      </p>
      {groups.map((group) => (
        <div key={group.category} className={styles.glossaryGroup}>
          <span className={styles.glossaryTitle}>{group.title}</span>
          <ul>
            {codes
              .filter((code) => code.category === group.category)
              .map((code) => (
                <li key={code.code}>
                  <code>{code.code}</code> {code.label}
                </li>
              ))}
          </ul>
        </div>
      ))}
      <p className={styles.note}>Les sigles se règlent dans Réglages, section « Natation ».</p>
    </details>
  );
}

export function ProgramField({
  value,
  hint,
  error,
  onChange,
}: {
  value: string;
  hint?: string | undefined;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  const program = useRef<HTMLTextAreaElement>(null);
  const settled = useSettled(value, 400);

  const preview = useQuery({
    queryKey: keys.planning.swimParse(settled),
    queryFn: () => planningApi.parseSwim(settled),
    enabled: settled.trim() !== '',
    staleTime: Infinity,
  });
  const glossary = useQuery({
    queryKey: keys.planning.swimCodes(),
    queryFn: planningApi.swimCodes,
  });

  /** Insère au curseur, comme une touche : le pouce ne va pas chercher la fin du champ. */
  function insert(text: string, spaced: boolean): void {
    const node = program.current;
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
    <div className={styles.programField}>
      <TextArea
        ref={program}
        label="Programme"
        value={value}
        placeholder={'Échauffement :\n400 CR EF\n8×100 CR EA PB R20'}
        hint={hint}
        error={error}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />

      <ChipStrip label="Insérer dans le programme">
        {SYNTAX.map((item) => (
          <Chip
            key={item.label}
            onClick={() => {
              insert(item.text, item.spaced);
            }}
          >
            {item.label}
          </Chip>
        ))}
        {FREQUENT.map((code) => (
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

      {/* L'aperçu est celui du serveur : lignes réécrites et total, ou la ligne fautive.
          Rien n'est lu ici. Il ne s'affiche que sur le texte qu'il a lu — un aperçu d'un
          texte qu'on vient de changer serait faux d'une frappe. */}
      {value.trim() !== '' && preview.data !== undefined && settled === value && (
        <div className={styles.preview} aria-live="polite">
          <span className={styles.previewTitle}>Lu par le serveur</span>
          <SwimProgramView program={preview.data} />
        </div>
      )}

      {glossary.data !== undefined && <Glossary codes={glossary.data.codes} />}
    </div>
  );
}
